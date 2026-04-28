import { sleep } from "../utils/timing";
import type {
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

export type ReplayerState = "idle" | "playing" | "paused" | "stopped";

export class Replayer {
  private options: ReplayOptions;
  private currentState: ReplayerState = "idle";
  private currentStepIndex = 0;
  private aborted = false;
  private breakpoints: Set<number> = new Set();
  private pausedPromiseResolve: ((value: void) => void) | null = null;
  private timings: StepTiming[] = [];
  private _speedMultiplier: number;

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

  async play(): Promise<ReplayPerformanceResult> {
    const startTime = performance.now();
    this.currentState = "playing";
    this.aborted = false;
    this.timings = [];

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
          await this.pause();
          continue;
        }

        if (step.type === "wait") {
          if (step.ms > 0 && speedMultiplier > 0) {
            await sleep(step.ms / speedMultiplier);
          }
          this.recordTiming(index, step, stepStart);
          continue;
        }

        const shouldProceed = (await this.options.onBeforeAction?.(step)) ?? true;
        if (!shouldProceed) {
          this.recordTiming(index, step, stepStart);
          continue;
        }

        if (step.type === "navigate") {
          this.recordTiming(index, step, stepStart);
          continue;
        }

        if (step.type === "assert") {
          const assertSuccess = await this.executeAssertion(step);
          this.recordTiming(index, step, stepStart);
          if (!assertSuccess) {
            status = "error";
            const err = new Error(
              `Assertion failed: ${step.assertion}${
                step.expected ? ` expected "${step.expected}"` : ""
              }`,
            );
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
        this.options.onAfterAction?.(step, el);
        this.options.hooks?.onReplayStep?.(step, index);
      }
    } finally {
      this.options.hooks?.onReplayEnd?.(script, status);
    }

    const endTime = performance.now();
    return {
      scriptId: script.id,
      scriptName: script.name,
      totalDurationMs: endTime - startTime,
      stepTimings: this.timings,
      startTime,
      endTime,
      stepsPerSecond: this.timings.length / ((endTime - startTime) / 1000),
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
    return new Promise((resolve) => {
      this.pausedPromiseResolve = resolve;
    });
  }

  resume(): void {
    if (this.currentState !== "paused") return;
    this.currentState = "playing";
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

  private async onErrorHandler(step: FormScriptStep, error: Error): Promise<"skip" | "abort"> {
    if (!this.options.onError) return "skip";
    return this.options.onError(step, error);
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

async function executeStep(step: FormScriptStep, el: Element): Promise<void> {
  const maybeScrollable = el as HTMLElement & {
    scrollIntoView?: (options?: ScrollIntoViewOptions) => void;
  };
  maybeScrollable.scrollIntoView?.({ block: "nearest", behavior: "smooth" });

  if (step.type === "input") {
    await setInputValue(el as HTMLInputElement | HTMLTextAreaElement, step.value);
    return;
  }
  if (step.type === "select") {
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

function getReactSelectStableSuffix(id: string): string | null {
  const match = id.match(/^react-select-\d+-(input|listbox|option-\d+|value)$/);
  if (!match) {
    return null;
  }
  return `-${match[1]}`;
}
