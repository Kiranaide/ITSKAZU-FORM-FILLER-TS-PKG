import { createMaskPlugin } from "../plugins/mask.plugin";
import { getEventTargetElement, isFormField, matchesAnySelector } from "../utils/dom";
import { nanoid } from "../utils/nanoid";
import { createDefaultPIIConfig, MASK_PLACEHOLDER, PIIDetector } from "./pii-detector";
import {
  FORMSCRIPT_VERSION,
  type FormScript,
  type FormScriptStep,
  type StepMetadata,
} from "./schema";
import { extractSelectors, toFormSelectorStrategy } from "./selector";
import type { RecordedAction, RecordedScript, RecorderOptions } from "./types";

const DEFAULT_MASK_SELECTORS = [
  '[type="password"]',
  '[autocomplete*="cc-number"]',
  '[autocomplete*="cc-csc"]',
  '[autocomplete*="cc-exp"]',
];

function mapRecordedTypeToStep(
  type: RecordedAction["type"],
  selector: ReturnType<typeof toFormSelectorStrategy>,
  value: string | boolean | string[] | undefined,
  timestamp: number,
  masked: boolean,
  metadata?: StepMetadata,
): FormScriptStep | null {
  if (type === "input" || type === "change") {
    const step: FormScriptStep = {
      type: "input",
      selector,
      value: typeof value === "string" ? value : "",
      masked,
      timestamp,
    };
    if (metadata) {
      step.metadata = metadata;
    }
    return step;
  }
  if (type === "select") {
    const step: FormScriptStep = {
      type: "select",
      selector,
      value: Array.isArray(value) ? (value[0] ?? "") : String(value ?? ""),
      timestamp,
    };
    if (metadata) {
      step.metadata = metadata;
    }
    return step;
  }
  if (type === "click" || type === "submit") {
    const step: FormScriptStep = {
      type: "click",
      selector,
      timestamp,
    };
    if (metadata) {
      step.metadata = metadata;
    }
    return step;
  }
  if (type === "keyboard") {
    const step: FormScriptStep = {
      type: "keyboard",
      selector,
      key: typeof value === "string" ? value : "",
      timestamp,
    };
    if (metadata) {
      step.metadata = metadata;
    }
    return step;
  }
  return null;
}

function createRecordedAction(
  type: RecordedAction["type"],
  selector: RecordedAction["selector"],
  value: string | boolean | string[] | undefined,
  timestamp: number,
  delay: number,
): RecordedAction {
  return {
    id: nanoid(),
    type,
    selector,
    value,
    timestamp,
    delay,
  };
}

export interface RecorderState {
  isRecording: boolean;
  stepCount: number;
}

export class Recorder {
  private steps: FormScriptStep[] = [];
  private actions: RecordedAction[] = [];
  private startTime = 0;
  private lastActionTime = 0;
  private options: RecorderOptions;
  private controllers: AbortController[] = [];
  private stopWatchingShadowRoots: (() => void) | undefined;
  private piiDetector: PIIDetector;
  private lastKeyboardEvent:
    | { selectorValue: string; key: string; timestamp: number }
    | undefined = undefined;
  private lastReactSelectInput: Element | null = null;
  private activeDatepickerInput: HTMLInputElement | null = null;
  private state: RecorderState = { isRecording: false, stepCount: 0 };

  constructor(options: RecorderOptions = {}) {
    const hooks = { ...(options.hooks ?? {}) };
    if (options.maskSensitiveInputs !== false) {
      createMaskPlugin().install(hooks);
    }
    this.options = { ...options, hooks };
    this.piiDetector = new PIIDetector(
      options.maskSensitiveInputs === false
        ? { enabled: false, selectors: [], fields: [] }
        : { selectors: options.mask ?? DEFAULT_MASK_SELECTORS },
    );
  }

  getState(): RecorderState {
    return { ...this.state, stepCount: this.steps.length };
  }

  start(): void {
    this.steps = [];
    this.actions = [];
    this.startTime = performance.now();
    this.lastActionTime = this.startTime;
    this.state = { isRecording: true, stepCount: 0 };

    const root = this.options.root ?? document.body;
    this.attachListeners(root);
    this.attachNavigationListeners();
    this.options.hooks?.onRecordStart?.();

    this.stopWatchingShadowRoots = this.options.observeShadowRoots?.((shadowRoot) => {
      this.attachListeners(shadowRoot);
    });
  }

  stop(): RecordedScript {
    this.controllers.forEach((controller) => {
      controller.abort();
    });
    this.controllers = [];
    this.stopWatchingShadowRoots?.();
    this.stopWatchingShadowRoots = undefined;
    this.state = { isRecording: false, stepCount: this.steps.length };

    const now = Date.now();
    const script: FormScript = {
      version: FORMSCRIPT_VERSION,
      id: nanoid(),
      name: `Recording ${new Date(now).toISOString()}`,
      createdAt: now,
      updatedAt: now,
      origin: location.origin,
      steps: this.steps,
    };
    this.options.hooks?.onRecordStop?.(script);
    return {
      version: 2,
      id: script.id,
      name: script.name,
      createdAt: script.createdAt,
      updatedAt: script.updatedAt,
      origin: script.origin,
      steps: script.steps,
      actions: this.actions,
    };
  }

  private attachListeners(root: EventTarget): void {
    const controller = new AbortController();
    this.controllers.push(controller);
    const signal = controller.signal;

    root.addEventListener("input", (event) => this.onInput(event as InputEvent), {
      signal,
      capture: true,
    });
    root.addEventListener("change", (event) => this.onChange(event), {
      signal,
      capture: true,
    });
    root.addEventListener("focus", (event) => this.onFocus(event as FocusEvent), {
      signal,
      capture: true,
    });
    root.addEventListener("blur", (event) => this.onBlur(event as FocusEvent), {
      signal,
      capture: true,
    });
    root.addEventListener("click", (event) => this.onClick(event as MouseEvent), {
      signal,
      capture: true,
    });
    root.addEventListener("keydown", (event) => this.onKeyDown(event as KeyboardEvent), {
      signal,
      capture: true,
    });
    root.addEventListener("submit", (event) => this.onSubmit(event as SubmitEvent), {
      signal,
      capture: true,
    });
  }

  private attachNavigationListeners(): void {
    const controller = new AbortController();
    this.controllers.push(controller);
    const signal = controller.signal;

    window.addEventListener("popstate", (event) => this.onPopState(event as PopStateEvent), {
      signal,
    });

    window.addEventListener("hashchange", (event) => this.onHashChange(), {
      signal,
    });
  }

  private onPopState(event: PopStateEvent): void {
    if (!this.state.isRecording) return;
    this.captureNavigation(location.href, "popstate");
  }

  private onHashChange(): void {
    if (!this.state.isRecording) return;
    this.captureNavigation(location.href, "popstate");
  }

  private captureNavigation(
    url: string,
    triggeredBy: "link" | "form" | "script" | "popstate" = "link",
  ): void {
    const step: FormScriptStep = {
      type: "navigate",
      url,
      triggeredBy,
      timestamp: Math.round(performance.now() - this.startTime),
    };
    this.steps.push(step);
  }

  private capture(
    type: RecordedAction["type"],
    el: Element,
    value?: string | boolean | string[],
    metadataOverride?: StepMetadata,
  ): void {
    if (this.shouldIgnore(el)) {
      return;
    }

    const now = performance.now();
    const delay = now - this.lastActionTime;
    this.lastActionTime = now;

    const selector = extractSelectors(el);
    const baseTimestamp = Math.round(now - this.startTime);
    const isMasked = this.isMasked(el);

    const action = createRecordedAction(
      type,
      selector,
      value,
      baseTimestamp,
      this.options.captureDelay === false ? 0 : delay,
    );
    const metadata =
      metadataOverride ??
      this.buildStepMetadata(type, el, value, baseTimestamp, selector.strategies[0]?.value);

    const step = mapRecordedTypeToStep(
      type,
      toFormSelectorStrategy(selector),
      value,
      baseTimestamp,
      isMasked,
      metadata,
    );

    const coalesceTargetIndex = this.getCoalesceInputActionIndex(type, selector, value, baseTimestamp);
    if (coalesceTargetIndex !== null) {
      this.mergeInputActionAt(coalesceTargetIndex, value, baseTimestamp, delay);
      if (step && step.type === "input") {
        const stepIndex = this.getLastInputStepIndex();
        if (stepIndex !== null) {
          this.mergeInputStepAt(stepIndex, step.value, step.timestamp, step.masked);
          const existing = this.steps[stepIndex];
          if (existing && existing.type === "input") {
            if (step.metadata) {
              existing.metadata = step.metadata;
            }
          }
        }
      }
      return;
    }

    this.actions.push(action);
    this.options.onAction?.(action);

    if (!step) {
      return;
    }

    const mapped = this.options.hooks?.onStep ? this.options.hooks.onStep(step) : step;
    if (!mapped) {
      return;
    }

    this.steps.push(mapped);
  }

  private getCoalesceInputActionIndex(
    type: RecordedAction["type"],
    selector: RecordedAction["selector"],
    value: string | boolean | string[] | undefined,
    timestamp: number,
  ): number | null {
    if ((type !== "input" && type !== "change") || typeof value !== "string") {
      return null;
    }
    const candidateIndex = this.getLastInputLikeActionIndex();
    if (candidateIndex === null) {
      return null;
    }
    const candidate = this.actions[candidateIndex];
    if (!candidate) {
      return null;
    }
    const lastPrimary = candidate.selector.strategies[0]?.value;
    const currentPrimary = selector.strategies[0]?.value;
    if (!lastPrimary || !currentPrimary || lastPrimary !== currentPrimary) {
      return null;
    }
    return timestamp - candidate.timestamp <= 1500 ? candidateIndex : null;
  }

  private getLastInputLikeActionIndex(): number | null {
    const last = this.actions.at(-1);
    if (!last) {
      return null;
    }
    if (last.type === "input" || last.type === "change") {
      return this.actions.length - 1;
    }
    // Blur-by-Tab often produces keyboard immediately before change.
    if (last.type === "keyboard") {
      const previousIndex = this.actions.length - 2;
      const previous = this.actions[previousIndex];
      if (previous && (previous.type === "input" || previous.type === "change")) {
        return previousIndex;
      }
    }
    return null;
  }

  private mergeInputActionAt(
    index: number,
    value: string | boolean | string[] | undefined,
    timestamp: number,
    delay: number,
  ): void {
    const action = this.actions[index];
    if (!action) {
      return;
    }
    action.type = "input";
    action.value = value;
    action.delay += this.options.captureDelay === false ? 0 : delay;
    action.timestamp = timestamp;
  }

  private getLastInputStepIndex(): number | null {
    const lastStep = this.steps.at(-1);
    if (!lastStep) {
      return null;
    }
    if (lastStep.type === "input") {
      return this.steps.length - 1;
    }
    if (lastStep.type === "keyboard") {
      const previousIndex = this.steps.length - 2;
      const previous = this.steps[previousIndex];
      if (previous && previous.type === "input") {
        return previousIndex;
      }
    }
    return null;
  }

  private mergeInputStepAt(index: number, value: string, timestamp: number, masked: boolean): void {
    const step = this.steps[index];
    if (!step || step.type !== "input") {
      return;
    }
    step.value = value;
    step.timestamp = timestamp;
    step.masked = masked;
  }

  private shouldIgnore(el: Element): boolean {
    return matchesAnySelector(el, this.options.ignore ?? []);
  }

  private isMasked(el: Element): boolean {
    if (this.options.maskSensitiveInputs === false) return false;

    if (this.piiDetector.shouldMask(el)) {
      return true;
    }

    const selectors = this.options.mask ?? DEFAULT_MASK_SELECTORS;
    return matchesAnySelector(el, selectors);
  }

  private onInput(event: InputEvent): void {
    const el = getEventTargetElement(event);
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      return;
    }

    const value = this.isMasked(el) ? MASK_PLACEHOLDER : el.value;
    this.capture("input", el, value);
  }

  private onChange(event: Event): void {
    const el = getEventTargetElement(event);
    if (!el) {
      return;
    }

    if (el instanceof HTMLSelectElement) {
      if (isReactDatePickerMonthOrYearSelect(el)) {
        // Collapse datepicker month/year changes into final day commit.
        return;
      }
      const selectedOptions = Array.from(el.selectedOptions);
      const values = selectedOptions.map((option) => option.value);
      const firstOption = selectedOptions[0];
      const metadata: StepMetadata = {
        controlType: "native-select",
        commitReason: "change",
      };
      if (firstOption?.value) {
        metadata.optionId = firstOption.value;
      }
      const optionLabel = firstOption?.textContent?.trim();
      if (optionLabel) {
        metadata.optionLabel = optionLabel;
      }
      this.capture("select", el, el.multiple ? values : (values[0] ?? ""), metadata);
      return;
    }

    if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox") {
        this.capture("checkbox", el, el.checked);
        return;
      }

      if (el.type === "radio") {
        this.capture("radio", el, el.value);
        return;
      }

      const value = this.isMasked(el) ? MASK_PLACEHOLDER : el.value;
      this.capture("change", el, value);
    }
  }

  private onFocus(event: FocusEvent): void {
    const el = getEventTargetElement(event);
    if (isFormField(el)) {
      this.capture("focus", el);
    }
  }

  private onBlur(event: FocusEvent): void {
    const el = getEventTargetElement(event);
    if (isFormField(el)) {
      this.capture("blur", el);
    }
  }

  private onClick(event: MouseEvent): void {
    const el = getEventTargetElement(event);
    if (!el) {
      return;
    }

    const target = this.getClickableTarget(el);
    if (!target || this.shouldIgnore(target)) {
      return;
    }

    if (this.captureReactSelectOption(target)) {
      return;
    }

    if (this.captureDatePickerDaySelection(target)) {
      return;
    }

    if (isReactDatePickerInput(target)) {
      this.activeDatepickerInput = target;
    }

    if (isReactSelectInput(target)) {
      this.lastReactSelectInput = target;
    }

    if (target instanceof HTMLAnchorElement && target.href) {
      if (target.target !== "_blank" && !target.href.startsWith("#")) {
        this.captureNavigation(target.href, "link");
      }
    }

    this.capture("click", target);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (!["Enter", "Tab", "Escape"].includes(event.key)) {
      return;
    }

    const el = getEventTargetElement(event);
    if (!el) {
      return;
    }

    const isButton = el instanceof HTMLButtonElement || el.getAttribute("role") === "button";
    if (!isFormField(el) && !isButton) {
      return;
    }

    const selector = extractSelectors(el);
    this.lastKeyboardEvent = {
      selectorValue: selector.strategies[0]?.value ?? "",
      key: event.key,
      timestamp: Math.round(performance.now() - this.startTime),
    };
    this.capture("keyboard", el, event.key);
  }

  private captureReactSelectOption(target: Element): boolean {
    if (target.getAttribute("role") !== "option") {
      return false;
    }
    const input = this.lastReactSelectInput;
    if (!input) {
      return false;
    }
    const optionId = target.getAttribute("data-value") ?? target.getAttribute("data-id") ?? undefined;
    const optionLabel = target.textContent?.trim() ?? undefined;
    const metadata: StepMetadata = {
      controlType: "react-select",
      commitReason: "option-select",
    };
    if (optionId) {
      metadata.optionId = optionId;
    }
    if (optionLabel) {
      metadata.optionLabel = optionLabel;
    }
    this.capture("select", input, optionId ?? optionLabel ?? "", metadata);
    return true;
  }

  private captureDatePickerDaySelection(target: Element): boolean {
    const ariaLabel = target.getAttribute("aria-label");
    if (!ariaLabel || !ariaLabel.startsWith("Choose ")) {
      return false;
    }
    const dateInfo = parseReactDatepickerAriaLabel(ariaLabel);
    if (!dateInfo) {
      return false;
    }
    const dateInput = this.activeDatepickerInput;
    if (!dateInput) {
      return false;
    }
    const value = dateInput.value || dateInfo.displayValue;
    this.capture("input", dateInput, value, {
      controlType: "datepicker",
      commitReason: "calendar-day",
      normalizedValue: dateInfo.isoDate,
      optionLabel: ariaLabel,
    });
    return true;
  }

  private buildStepMetadata(
    type: RecordedAction["type"],
    el: Element,
    value: string | boolean | string[] | undefined,
    timestamp: number,
    selectorValue?: string,
  ): StepMetadata {
    const fieldType = (el as HTMLInputElement).type ?? el.tagName.toLowerCase();
    const selector = extractSelectors(el);
    const metadata: StepMetadata = {};
    const controlType = inferControlType(type, fieldType, el);
    if (controlType) {
      metadata.controlType = controlType;
    }
    const commitReason = inferCommitReason(type, this.lastKeyboardEvent, selectorValue, timestamp);
    if (commitReason) {
      metadata.commitReason = commitReason;
    }
    if (selector.source) {
      metadata.selectorSource = selector.source;
    }
    if (selector.confidence) {
      metadata.selectorConfidence = selector.confidence;
    }
    if (typeof value === "string" && metadata.controlType === "currency") {
      metadata.normalizedValue = value.replace(/[,\s]/g, "");
    }
    return metadata;
  }

  private onSubmit(event: SubmitEvent): void {
    const el = getEventTargetElement(event);
    if (el instanceof HTMLFormElement) {
      const action = el.action || location.href;
      if (action && action !== `${location.origin}/`) {
        this.captureNavigation(action, "form");
      }
      this.capture("submit", el);
    }
  }

  private getClickableTarget(el: Element): Element | null {
    const target = el.closest(
      [
        "button",
        "a[href]",
        "input",
        "select",
        "textarea",
        "label",
        "[aria-label^='Choose ']",
        "[role='button']",
        "[role='link']",
        "[role='option']",
        "[role='menuitem']",
        "[role='combobox']",
        "[aria-haspopup='listbox']",
        "[aria-haspopup='menu']",
      ].join(","),
    );

    if (!target) {
      return this.resolveReactSelectControlTarget(el);
    }
    if (target instanceof HTMLLabelElement && target.control) {
      return target.control;
    }
    return target;
  }

  private resolveReactSelectControlTarget(el: Element): Element | null {
    const control = el.closest("div[class*='-control']");
    if (!control) {
      return null;
    }

    const combo = control.querySelector(
      "input[role='combobox'][id^='react-select-'], input[id^='react-select-'][type='text']",
    );
    return combo instanceof Element ? combo : null;
  }
}

function inferControlType(
  type: RecordedAction["type"],
  fieldType: string,
  el: Element,
): StepMetadata["controlType"] {
  if (type === "select") {
    if (el instanceof HTMLSelectElement) return "native-select";
    return "react-select";
  }
  if (el.getAttribute("role") === "combobox") return "react-select";
  if (fieldType === "button" || type === "click") return "button";
  if (fieldType === "number" || /currency|amount|limit|price/i.test(el.getAttribute("name") ?? "")) {
    return "currency";
  }
  if (
    (el as HTMLElement).className?.includes("react-datepicker") ||
    el.getAttribute("aria-label")?.startsWith("Choose ")
  ) {
    return "datepicker";
  }
  if (type === "input" || type === "change") return "text";
  return "unknown";
}

function inferCommitReason(
  type: RecordedAction["type"],
  lastKeyboardEvent: { selectorValue: string; key: string; timestamp: number } | undefined,
  selectorValue: string | undefined,
  timestamp: number,
): StepMetadata["commitReason"] {
  if (type === "keyboard") return "keyboard";
  if (type === "click") return "click";
  if (type === "change") return "change";
  if (type === "select") return "option-select";
  if (type === "input" && lastKeyboardEvent && selectorValue) {
    const sameField = lastKeyboardEvent.selectorValue === selectorValue;
    const near = timestamp - lastKeyboardEvent.timestamp <= 1500;
    if (sameField && near && lastKeyboardEvent.key === "Tab") return "tab";
    if (sameField && near && lastKeyboardEvent.key === "Enter") return "enter";
  }
  return type === "input" ? "input" : "unknown";
}

function isReactSelectInput(target: Element): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.getAttribute("role") === "combobox" &&
    target.id.startsWith("react-select-")
  );
}

function isReactDatePickerInput(target: Element): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement)) {
    return false;
  }
  return (
    target.classList.contains("react-datepicker-ignore-onclickoutside") ||
    target.closest(".react-datepicker-wrapper") !== null
  );
}

function isReactDatePickerMonthOrYearSelect(el: HTMLSelectElement): boolean {
  return (
    el.classList.contains("react-datepicker__month-select") ||
    el.classList.contains("react-datepicker__year-select")
  );
}

function parseReactDatepickerAriaLabel(
  ariaLabel: string,
): { isoDate: string; displayValue: string } | null {
  const parsed = ariaLabel.match(/,\s+([A-Za-z]+)\s+(\d+)(?:st|nd|rd|th),\s+(\d{4})$/);
  if (!parsed) {
    return null;
  }
  const [, monthName, dayRaw, yearRaw] = parsed;
  if (!monthName || !dayRaw || !yearRaw) {
    return null;
  }
  const month = monthNameToNumber(monthName);
  const day = Number(dayRaw);
  const year = Number(yearRaw);
  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) {
    return null;
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const yyyy = String(year);
  return {
    isoDate: `${yyyy}-${mm}-${dd}`,
    displayValue: `${mm}/${dd}/${yyyy}`,
  };
}

function monthNameToNumber(monthName: string): number | null {
  const months = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const index = months.indexOf(monthName.toLowerCase());
  return index >= 0 ? index + 1 : null;
}
