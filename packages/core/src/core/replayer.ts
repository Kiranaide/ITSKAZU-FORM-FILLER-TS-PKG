import { sleep } from "../utils/timing";
import type {
  AssertionProperty,
  AssertStep,
  FormScript,
  FormScriptStep,
  ReplayPerformanceResult,
  SelectorStrategy,
  StepTiming,
} from "./schema";
import { normalizeScriptInput as normalizeReplayScriptInput } from "./script-normalizer";
import { resolveByFormSelectorStrategy, selectorStrategyToQuery } from "./selector";
import type { ReplayOptions } from "./types";

export type ReplayerState = "idle" | "playing" | "paused" | "stopped" | "done";
type ReplayerEventName = "step" | "pause" | "resume" | "done" | "breakpoint";
type ReplayerEventPayload =
  | { name: "step"; step: FormScriptStep; index: number }
  | { name: "pause"; index: number }
  | { name: "resume"; index: number }
  | { name: "done"; status: "success" | "error" }
  | { name: "breakpoint"; index: number; step: FormScriptStep };
type ReplayerListener = (payload: ReplayerEventPayload) => void;

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AssertionError";
  }
}

export class Replayer {
  private options: ReplayOptions;
  private currentState: ReplayerState = "idle";
  private currentStepIndex = 0;
  private aborted = false;
  private breakpoints: Set<number> = new Set();
  private pausedPromiseResolve: ((value: void) => void) | null = null;
  private timings: StepTiming[] = [];
  private _speedMultiplier: number;
  private listeners: Map<ReplayerEventName, Set<ReplayerListener>> = new Map();

  constructor(options: ReplayOptions) {
    this.options = options;
    this._speedMultiplier = options.speedMultiplier ?? 1;
  }

  get speedMultiplier(): number {
    return this._speedMultiplier;
  }

  set speedMultiplier(value: number) {
    this._speedMultiplier = Math.max(0.1, Math.min(10, value));
  }

  get state(): ReplayerState {
    return this.currentState;
  }

  async play(params?: { speed?: number }): Promise<ReplayPerformanceResult> {
    const startTime = performance.now();
    this.currentState = "playing";
    this.aborted = false;
    this.timings = [];
    if (params?.speed) {
      this.speedMultiplier = params.speed;
    }

    const script = normalizeReplayScriptInput(this.options.script);
    this.options.hooks?.onReplayStart?.(script);

    let status: "success" | "error" = "success";
    const speedMultiplier = this._speedMultiplier;

    try {
      let shouldContinue = true;
      for (const [index, step] of script.steps.entries()) {
        if (!shouldContinue) break;
        if (this.currentState === "stopped") break;

        this.currentStepIndex = index;
        const stepStart = performance.now();

        let localState: ReplayerState = this.currentState;
        while ((localState as string) === "paused") {
          await new Promise<void>((resolve) => {
            this.pausedPromiseResolve = resolve;
          });
          localState = this.currentState;
        }

        if ((this.currentState as string) === "stopped") {
          shouldContinue = false;
          break;
        }

        if (this.aborted) break;

        if (this.breakpoints.has(index) && (this.currentState as string) === "playing") {
          this.emit("breakpoint", { name: "breakpoint", index, step });
          await this.pause();
          continue;
        }

        if (step.type === "wait") {
          if (step.ms > 0 && speedMultiplier > 0) {
            await sleep(step.ms / speedMultiplier);
          }
          this.recordTiming(index, step, stepStart);
          this.emit("step", { name: "step", step, index });
          continue;
        }

        const shouldProceed = (await this.options.onBeforeAction?.(step)) ?? true;
        if (!shouldProceed) {
          this.recordTiming(index, step, stepStart);
          this.emit("step", { name: "step", step, index });
          continue;
        }

        if (step.type === "navigate") {
          this.recordTiming(index, step, stepStart);
          this.emit("step", { name: "step", step, index });
          continue;
        }

        if (step.type === "assert") {
          const assertSuccess = await this.executeAssertion(step);
          this.recordTiming(index, step, stepStart);
          this.emit("step", { name: "step", step, index });
          if (!assertSuccess) {
            status = "error";
            const err = new AssertionError(buildAssertionErrorMessage(step, index));
            this.options.hooks?.onError?.(err, "replay");
            const resolution = await this.onErrorHandler(step, err);
            if (resolution === "abort") {
              this.aborted = true;
              this.currentState = "stopped";
            }
          }
          continue;
        }

        const selector = "selector" in step ? step.selector : undefined;
        if (!selector) continue;

        const el = await this.resolveElementWithRetry(selector);
        if (!el) {
          status = "error";
          const err = new Error(buildMissingElementMessage(step));
          this.options.hooks?.onError?.(err, "replay");
          const resolution = await this.onErrorHandler(step, err);
          if (resolution === "abort") {
            this.aborted = true;
            this.currentState = "stopped";
          }
          this.recordTiming(index, step, stepStart);
          this.emit("step", { name: "step", step, index });
          continue;
        }

        if (this.options.highlight) {
          this.options.highlightElement?.(el);
        }

        try {
          await executeStep(step, el);
        } catch (error) {
          status = "error";
          this.options.hooks?.onError?.(error as Error, "replay");
          const resolution = await this.onErrorHandler(step, error as Error);
          if (resolution === "abort") {
            this.aborted = true;
            this.currentState = "stopped";
          }
        }

        this.recordTiming(index, step, stepStart);
        this.emit("step", { name: "step", step, index });
        this.options.onAfterAction?.(step, el);
        this.options.hooks?.onReplayStep?.(step, index);
      }
    } finally {
      if (this.currentState !== "stopped") {
        this.currentState = "done";
      }
      this.options.hooks?.onReplayEnd?.(script, status);
      this.emit("done", { name: "done", status });
    }

    const endTime = performance.now();
    const totalDurationMs = endTime - startTime;
    const slowThreshold = this.options.slowThreshold ?? 500;
    const slowSteps = this.timings.filter((timing) => timing.durationMs > slowThreshold);
    return {
      scriptId: script.id,
      scriptName: script.name,
      totalMs: totalDurationMs,
      totalDurationMs,
      timings: this.timings,
      stepTimings: this.timings,
      slowSteps,
      startTime,
      endTime,
      stepsPerSecond: this.timings.length / (totalDurationMs / 1000),
    };
  }

  private recordTiming(index: number, step: FormScriptStep, startTime: number): void {
    const endTime = performance.now();
    const timing: StepTiming = {
      stepIndex: index,
      type: step.type,
      startTime,
      endTime,
      durationMs: endTime - startTime,
    };
    if ("selector" in step && step.selector) {
      timing.selector = step.selector;
    }
    this.timings.push(timing);
  }

  private async executeAssertion(step: AssertStep): Promise<boolean> {
    if (!step.selector) return true;

    const el = await this.resolveElementWithRetry(step.selector);
    if (!el) return false;

    const htmlEl = el as HTMLElement;

    switch (step.assertion) {
      case "visible":
        return htmlEl.offsetParent !== null;
      case "hidden":
        return htmlEl.offsetParent === null;
      case "enabled":
        return !htmlEl.hasAttribute("disabled");
      case "disabled":
        return htmlEl.hasAttribute("disabled");
      case "checked":
        return el instanceof HTMLInputElement && el.checked;
      case "unchecked":
        return el instanceof HTMLInputElement && !el.checked;
      case "text": {
        const actual = el.textContent?.trim() ?? "";
        if (step.operator === "contains") {
          return actual.includes((step.expected as string) ?? "");
        }
        if (step.operator === "matches") {
          return new RegExp((step.expected as string) ?? "").test(actual);
        }
        return actual === step.expected;
      }
      case "value": {
        const actual = (el as HTMLInputElement | HTMLSelectElement).value ?? "";
        if (step.operator === "contains") {
          return actual.includes((step.expected as string) ?? "");
        }
        return actual === step.expected;
      }
      case "count": {
        const count = (step.expected as number) ?? 0;
        if (step.operator === "gt") return this.countElements(step.selector) > count;
        if (step.operator === "gte") return this.countElements(step.selector) >= count;
        if (step.operator === "lt") return this.countElements(step.selector) < count;
        if (step.operator === "lte") return this.countElements(step.selector) <= count;
        return this.countElements(step.selector) === count;
      }
      case "contains": {
        const text = el.textContent?.trim() ?? "";
        return text.includes((step.expected as string) ?? "");
      }
      default:
        return true;
    }
  }

  private countElements(selector?: SelectorStrategy): number {
    if (!selector) return 1;
    const query = selectorStrategyToQuery(selector);
    return document.querySelectorAll(query).length;
  }

  async pause(): Promise<void> {
    if (this.currentState !== "playing") return;
    this.currentState = "paused";
    this.emit("pause", { name: "pause", index: this.currentStepIndex });
    return new Promise((resolve) => {
      this.pausedPromiseResolve = resolve;
    });
  }

  resume(): void {
    if (this.currentState !== "paused") return;
    this.currentState = "playing";
    this.emit("resume", { name: "resume", index: this.currentStepIndex });
    this.pausedPromiseResolve?.();
  }

  async stepForward(): Promise<void> {
    if (this.currentState !== "paused" && this.currentState !== "idle") return;

    const script = normalizeReplayScriptInput(this.options.script);
    const step = script.steps[this.currentStepIndex];
    if (!step || step.type === "assert") {
      this.currentStepIndex++;
      return;
    }

    if (step.type !== "wait" && step.type !== "navigate" && "selector" in step) {
      const el = await this.resolveElementWithRetry(step.selector);
      if (el) {
        await executeStep(step, el);
        if (this.options.highlight) {
          this.options.highlightElement?.(el);
        }
      }
    }
    this.currentStepIndex++;
  }

  stop(): void {
    this.currentState = "stopped";
    this.aborted = true;
    this.pausedPromiseResolve?.();
  }

  abort(): void {
    this.stop();
  }

  addBreakpoint(stepIndex: number): void {
    this.breakpoints.add(stepIndex);
  }

  removeBreakpoint(stepIndex: number): void {
    this.breakpoints.delete(stepIndex);
  }

  getBreakpoints(): number[] {
    return Array.from(this.breakpoints);
  }

  clearBreakpoints(): void {
    this.breakpoints.clear();
  }

  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  on(eventName: ReplayerEventName, listener: ReplayerListener): () => void {
    const listeners = this.listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this.listeners.set(eventName, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  off(eventName: ReplayerEventName, listener: ReplayerListener): void {
    this.listeners.get(eventName)?.delete(listener);
  }

  private async onErrorHandler(step: FormScriptStep, error: Error): Promise<"skip" | "abort"> {
    if (!this.options.onError) return "skip";
    return this.options.onError(step, error);
  }

  private emit(eventName: ReplayerEventName, payload: ReplayerEventPayload): void {
    this.listeners.get(eventName)?.forEach((listener) => {
      listener(payload);
    });
  }

  private async resolveElementWithRetry(selector: SelectorStrategy): Promise<Element | null> {
    const timeoutMs = 1200;
    const intervalMs = 120;
    const start = Date.now();

    while (Date.now() - start <= timeoutMs) {
      if (this.aborted || this.currentState === "stopped") return null;

      const found = resolveByFormSelectorStrategy(selector);
      if (found) return found;
      await sleep(intervalMs);
    }

    return resolveByFormSelectorStrategy(selector);
  }
}

export function createAssertStep(
  selector: SelectorStrategy,
  property: AssertionProperty,
  expected?: string | boolean,
): AssertStep {
  const assertion =
    property === "checked"
      ? expected
        ? "checked"
        : "unchecked"
      : property === "text"
        ? "text"
        : property === "value"
          ? "value"
          : expected
            ? "visible"
            : "hidden";
  const step: AssertStep = {
    type: "assert",
    selector,
    property,
    assertion,
    timestamp: Date.now(),
  };
  if (expected !== undefined) {
    step.expected = typeof expected === "boolean" ? String(expected) : expected;
  }
  return step;
}

async function executeStep(step: FormScriptStep, el: Element): Promise<void> {
  const maybeScrollable = el as HTMLElement & {
    scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
  };
  maybeScrollable.scrollIntoView?.({ block: "nearest", behavior: "smooth" });

  if (step.type === "input") {
    if (step.metadata?.controlType === "datepicker" && step.metadata.optionLabel) {
      await selectDatePickerDay(el, step.metadata.optionLabel, step.metadata.normalizedValue);
      return;
    }
    if (step.metadata?.controlType === "datepicker") {
      const value = step.value || toDisplayDate(step.metadata.normalizedValue) || "";
      await setDatePickerInputValue(el, value);
      return;
    }
    await setInputValue(el as HTMLInputElement | HTMLTextAreaElement, step.value);
    return;
  }
  if (step.type === "select") {
    if (step.metadata?.controlType === "react-select") {
      await selectReactSelectOption(el, step);
      return;
    }
    const select = el as HTMLSelectElement;
    if (select.multiple && step.value.includes("||")) {
      const chosen = new Set(step.value.split("||"));
      for (const option of Array.from(select.options)) {
        option.selected = chosen.has(option.value);
      }
    } else {
      select.value = step.value;
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (step.type === "click") {
    if (el instanceof HTMLFormElement) {
      el.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      return;
    }
    const control = findReactSelectControl(el);
    if (control) {
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    }
    (el as HTMLElement).click();
    return;
  }
  if (step.type === "keyboard") {
    (el as HTMLElement).dispatchEvent(
      new KeyboardEvent("keydown", {
        key: step.key,
        bubbles: true,
      }),
    );
  }
}

async function selectDatePickerDay(
  el: Element,
  dayAriaLabel: string,
  normalizedValue?: string,
): Promise<void> {
  const trigger = el as HTMLElement;
  trigger.click();
  const ariaLookupTimeoutMs = normalizedValue ? 260 : 1400;
  const dayByAria = await waitForElement(
    () => findVisibleElementByAriaLabel(dayAriaLabel),
    ariaLookupTimeoutMs,
    50,
  );
  if (dayByAria) {
    dayByAria.click();
    return;
  }

  const dayByNormalized = normalizedValue
    ? await findDatePickerDayByNormalizedValue(normalizedValue)
    : null;
  if (dayByNormalized) {
    dayByNormalized.click();
    return;
  }

  throw new Error(`Datepicker day not found (${dayAriaLabel})`);
}

async function setDatePickerInputValue(el: Element, value: string): Promise<void> {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return;
  }

  const prototype =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  nativeValueSetter?.call(el, value);
  if (el.value !== value) {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  (el as HTMLElement).dispatchEvent(new FocusEvent("blur", { bubbles: true }));
  await sleep(10);
}

function toDisplayDate(isoDate: string | undefined): string | null {
  if (!isoDate) {
    return null;
  }
  const parsed = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parsed) {
    return null;
  }
  const [, yyyy, mm, dd] = parsed;
  if (!yyyy || !mm || !dd) {
    return null;
  }
  return `${mm}/${dd}/${yyyy}`;
}

async function findDatePickerDayByNormalizedValue(isoDate: string): Promise<HTMLElement | null> {
  const parsed = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!parsed) {
    return null;
  }
  const [, yyyy, mm, dd] = parsed;
  if (!yyyy || !mm || !dd) {
    return null;
  }

  const popper = getVisibleDatePickerPopper();
  if (!popper) {
    return null;
  }

  const monthSelect = popper.querySelector(".react-datepicker__month-select");
  const yearSelect = popper.querySelector(".react-datepicker__year-select");
  if (monthSelect instanceof HTMLSelectElement) {
    const targetMonth = String(Number(mm) - 1);
    if (monthSelect.value !== targetMonth) {
      monthSelect.value = targetMonth;
      monthSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(35);
    }
  }
  if (yearSelect instanceof HTMLSelectElement) {
    if (yearSelect.value !== yyyy) {
      yearSelect.value = yyyy;
      yearSelect.dispatchEvent(new Event("change", { bubbles: true }));
      await sleep(35);
    }
  }

  const dayClassThreeDigits = `.react-datepicker__day--${String(Number(dd)).padStart(3, "0")}`;
  const dayClassTwoDigits = `.react-datepicker__day--${dd}`;
  const allMatches = Array.from(
    popper.querySelectorAll(`${dayClassThreeDigits}, ${dayClassTwoDigits}`),
  );
  const inMonth = allMatches.find(
    (candidate) =>
      candidate instanceof HTMLElement &&
      !candidate.classList.contains("react-datepicker__day--outside-month"),
  );
  if (inMonth instanceof HTMLElement) {
    return inMonth;
  }
  const anyVisible = allMatches.find((candidate) => candidate instanceof HTMLElement);
  return anyVisible instanceof HTMLElement ? anyVisible : null;
}

function getVisibleDatePickerPopper(): HTMLElement | null {
  const poppers = Array.from(document.querySelectorAll(".react-datepicker-popper"));
  const visible = poppers.find(
    (candidate) => candidate instanceof HTMLElement && isElementVisible(candidate),
  );
  return visible instanceof HTMLElement ? visible : null;
}

async function selectReactSelectOption(
  el: Element,
  step: Extract<FormScriptStep, { type: "select" }>,
): Promise<void> {
  const input = resolveReactSelectInput(el);
  await ensureReactSelectMenuOpen(el, input);

  const option = await waitForElement(
    () =>
      findReactSelectOption(input, {
        label: step.metadata?.optionLabel,
        optionId: step.metadata?.optionId,
        fallbackLabel: step.value,
      }),
    1400,
    50,
  );
  option?.click();
}

function resolveReactSelectInput(el: Element): HTMLInputElement | null {
  if (el instanceof HTMLInputElement) {
    return el;
  }
  const control = findReactSelectControl(el);
  if (!control) {
    return null;
  }
  const input = control.querySelector(
    "input[role='combobox'][id^='react-select-'], input[id^='react-select-'][type='text']",
  );
  return input instanceof HTMLInputElement ? input : null;
}

function findReactSelectOptionByLabel(
  label: string | undefined,
  root: ParentNode = document,
): HTMLElement | null {
  if (!label) {
    return null;
  }
  const normalized = label.trim();
  if (!normalized) {
    return null;
  }
  const options = Array.from(root.querySelectorAll("[role='option']"));
  const match = options.find((option) => (option.textContent ?? "").trim() === normalized);
  return match instanceof HTMLElement && isElementVisible(match) ? match : null;
}

function findReactSelectOptionById(
  optionId: string | undefined,
  root: ParentNode = document,
): HTMLElement | null {
  if (!optionId) {
    return null;
  }
  const escaped = CSS.escape(optionId);
  const option = root.querySelector(
    `[role='option'][data-value="${escaped}"], [role='option'][data-id="${escaped}"], [data-value="${escaped}"], [data-id="${escaped}"]`,
  );
  return option instanceof HTMLElement && isElementVisible(option) ? option : null;
}

function findVisibleElementByAriaLabel(label: string): HTMLElement | null {
  const allWithAriaLabel = Array.from(document.querySelectorAll("[aria-label]"));
  const match = allWithAriaLabel.find((candidate) => candidate.getAttribute("aria-label") === label);
  return match instanceof HTMLElement && isElementVisible(match) ? match : null;
}

async function ensureReactSelectMenuOpen(
  el: Element,
  input: HTMLInputElement | null,
): Promise<void> {
  const trigger = input ?? (el as HTMLElement);
  if (input?.getAttribute("aria-expanded") === "true") {
    return;
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const control = findReactSelectControl(el);
    if (control) {
      control.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    }
    trigger.click();
    await sleep(45);
    if (input?.getAttribute("aria-expanded") === "true" || findReactSelectListbox(input)) {
      return;
    }
  }
}

function findReactSelectOption(
  input: HTMLInputElement | null,
  targets: {
    label: string | undefined;
    optionId: string | undefined;
    fallbackLabel: string | undefined;
  },
): HTMLElement | null {
  const listbox = findReactSelectListbox(input);
  if (listbox) {
    return (
      findReactSelectOptionByLabel(targets.label, listbox) ??
      findReactSelectOptionById(targets.optionId, listbox) ??
      findReactSelectOptionByLabel(targets.fallbackLabel, listbox)
    );
  }

  return (
    findReactSelectOptionByLabel(targets.label) ??
    findReactSelectOptionById(targets.optionId) ??
    findReactSelectOptionByLabel(targets.fallbackLabel)
  );
}

function findReactSelectListbox(input: HTMLInputElement | null): HTMLElement | null {
  const controlsId = input?.getAttribute("aria-controls");
  if (controlsId) {
    const fromAriaControls = document.getElementById(controlsId);
    if (fromAriaControls instanceof HTMLElement) {
      return fromAriaControls;
    }
  }
  const visibleListbox = Array.from(document.querySelectorAll("[role='listbox']")).find((node) =>
    isElementVisible(node as HTMLElement),
  );
  return visibleListbox instanceof HTMLElement ? visibleListbox : null;
}

async function waitForElement<T>(
  factory: () => T | null,
  timeoutMs: number,
  intervalMs: number,
): Promise<T | null> {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const value = factory();
    if (value) {
      return value;
    }
    await sleep(intervalMs);
  }
  return factory();
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) {
    return false;
  }
  if (el.getAttribute("aria-hidden") === "true") {
    return false;
  }
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }
  return true;
}

async function setInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
  if (el.disabled) return;
  if (el.readOnly) return;

  const prototype =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;

  const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    const boolVal = value === "true";
    el.checked = boolVal;
    if (el.type === "radio" && boolVal) {
      el.click();
    }
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (shouldTypeLikeHuman(el)) {
    await typeLikeHuman(el, value, nativeValueSetter);
  } else {
    nativeValueSetter?.call(el, value);
    if (el.value !== value) {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function shouldTypeLikeHuman(el: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (el instanceof HTMLTextAreaElement) {
    return true;
  }
  const textLikeTypes = new Set(["", "text", "search", "email", "tel", "url", "password"]);
  return textLikeTypes.has(el.type);
}

async function typeLikeHuman(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  nativeValueSetter:
    | ((this: HTMLInputElement | HTMLTextAreaElement, v: string) => void)
    | undefined,
): Promise<void> {
  nativeValueSetter?.call(el, "");
  if (el.value !== "") {
    el.value = "";
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));

  let current = "";
  for (const ch of value) {
    current += ch;
    (el as HTMLElement).dispatchEvent(new KeyboardEvent("keydown", { key: ch, bubbles: true }));
    nativeValueSetter?.call(el, current);
    if (el.value !== current) {
      el.value = current;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    (el as HTMLElement).dispatchEvent(new KeyboardEvent("keyup", { key: ch, bubbles: true }));
    await sleep(12);
  }
}

export function normalizeScriptInput(raw: ReplayOptions["script"]): FormScript {
  return normalizeReplayScriptInput(raw);
}

function findReactSelectControl(el: Element): HTMLElement | null {
  const candidate = el.closest("div[class*='-control']");
  return candidate instanceof HTMLElement ? candidate : null;
}

function buildMissingElementMessage(
  step: Extract<FormScriptStep, { type: "input" | "click" | "keyboard" | "select" }>,
): string {
  const selector = "selector" in step ? step.selector : null;
  if (!selector) return "Element not found";
  const query = selectorStrategyToQuery(selector);
  const reactSelectHint = describeReactSelectLookup(selector);
  const combobox = document.querySelector("input[role='combobox'][id^='react-select-']");
  const comboboxState =
    combobox instanceof HTMLInputElement
      ? `open=${combobox.getAttribute("aria-expanded") ?? "unknown"}, active=${combobox.getAttribute("aria-activedescendant") ?? ""}`
      : "no-combobox";
  const hint = reactSelectHint ? `, ${reactSelectHint}` : "";
  return `Element not found (query="${query}"${hint}, ${comboboxState})`;
}

function describeReactSelectLookup(selector: SelectorStrategy): string {
  if (selector.kind !== "id" || !selector.value.startsWith("react-select-")) {
    return "";
  }

  const suffix = getReactSelectStableSuffix(selector.value);
  if (!suffix) {
    return "";
  }
  const fallbackMatches = document.querySelectorAll(`[id$="${suffix}"]`).length;
  return `fallback="[id$='${suffix}']" matches=${fallbackMatches}`;
}

function buildAssertionErrorMessage(step: AssertStep, index: number): string {
  const target = step.selector ? selectorStrategyToQuery(step.selector) : "<unknown-selector>";
  const expectedText = step.expected !== undefined ? ` expected=${String(step.expected)}` : "";
  return `Assert failed: ${target} ${step.assertion}${expectedText} at step ${index}`;
}

function getReactSelectStableSuffix(id: string): string | null {
  const match = id.match(/^react-select-\d+-(input|listbox|option-\d+|value)$/);
  if (!match) {
    return null;
  }
  return `-${match[1]}`;
}
