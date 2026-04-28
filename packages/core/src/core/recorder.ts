import { getEventTargetElement, isFormField, matchesAnySelector } from "../utils/dom";
import { nanoid } from "../utils/nanoid";
import { FORMSCRIPT_VERSION, type FormScript, type FormScriptStep } from "./schema";
import { extractSelectors, toFormSelectorStrategy } from "./selector";
import type { RecordedAction, RecordedScript, RecorderOptions } from "./types";

const DEFAULT_MASK_SELECTORS = [
  '[type="password"]',
  '[autocomplete*="cc-number"]',
  '[autocomplete*="cc-csc"]',
];

function mapRecordedTypeToStep(
  type: RecordedAction["type"],
  selector: ReturnType<typeof toFormSelectorStrategy>,
  value: string | boolean | string[] | undefined,
  timestamp: number,
  masked: boolean,
): FormScriptStep | null {
  if (type === "input" || type === "change") {
    return {
      type: "input",
      selector,
      value: typeof value === "string" ? value : "",
      masked,
      timestamp,
    };
  }
  if (type === "select") {
    return {
      type: "select",
      selector,
      value: Array.isArray(value) ? (value[0] ?? "") : String(value ?? ""),
      timestamp,
    };
  }
  if (type === "click" || type === "submit") {
    return {
      type: "click",
      selector,
      timestamp,
    };
  }
  if (type === "keyboard") {
    return {
      type: "keyboard",
      selector,
      key: typeof value === "string" ? value : "",
      timestamp,
    };
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

export class Recorder {
  private steps: FormScriptStep[] = [];
  private actions: RecordedAction[] = [];
  private startTime = 0;
  private lastActionTime = 0;
  private options: RecorderOptions;
  private controllers: AbortController[] = [];
  private stopWatchingShadowRoots: (() => void) | undefined;

  constructor(options: RecorderOptions = {}) {
    this.options = options;
  }

  start(): void {
    this.steps = [];
    this.actions = [];
    this.startTime = performance.now();
    this.lastActionTime = this.startTime;

    const root = this.options.root ?? document.body;
    this.attachListeners(root);
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

  private capture(
    type: RecordedAction["type"],
    el: Element,
    value?: string | boolean | string[],
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

    const step = mapRecordedTypeToStep(
      type,
      toFormSelectorStrategy(selector),
      value,
      baseTimestamp,
      isMasked,
    );

    if (this.shouldCoalesceInput(type, selector, value, baseTimestamp)) {
      this.mergeLastInputAction(value, baseTimestamp, delay);
      if (step && step.type === "input") {
        this.mergeLastInputStep(step.value, step.timestamp, step.masked);
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

  private shouldCoalesceInput(
    type: RecordedAction["type"],
    selector: RecordedAction["selector"],
    value: string | boolean | string[] | undefined,
    timestamp: number,
  ): boolean {
    if ((type !== "input" && type !== "change") || typeof value !== "string") {
      return false;
    }
    const last = this.actions.at(-1);
    if (!last || (last.type !== "input" && last.type !== "change")) {
      return false;
    }
    const lastPrimary = last.selector.strategies[0]?.value;
    const currentPrimary = selector.strategies[0]?.value;
    if (!lastPrimary || !currentPrimary || lastPrimary !== currentPrimary) {
      return false;
    }
    return timestamp - last.timestamp <= 1500;
  }

  private mergeLastInputAction(
    value: string | boolean | string[] | undefined,
    timestamp: number,
    delay: number,
  ): void {
    const last = this.actions.at(-1);
    if (!last) {
      return;
    }
    last.type = "input";
    last.value = value;
    last.delay += this.options.captureDelay === false ? 0 : delay;
    last.timestamp = timestamp;
  }

  private mergeLastInputStep(value: string, timestamp: number, masked: boolean): void {
    const lastStep = this.steps.at(-1);
    if (!lastStep || lastStep.type !== "input") {
      return;
    }
    lastStep.value = value;
    lastStep.timestamp = timestamp;
    lastStep.masked = masked;
  }

  private shouldIgnore(el: Element): boolean {
    return matchesAnySelector(el, this.options.ignore ?? []);
  }

  private isMasked(el: Element): boolean {
    const selectors = [
      ...(this.options.maskSensitiveInputs === false ? [] : DEFAULT_MASK_SELECTORS),
      ...(this.options.mask ?? []),
    ];
    return matchesAnySelector(el, selectors);
  }

  private onInput(event: InputEvent): void {
    const el = getEventTargetElement(event);
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
      return;
    }

    const value = this.isMasked(el) ? "[masked]" : el.value;
    this.capture("input", el, value);
  }

  private onChange(event: Event): void {
    const el = getEventTargetElement(event);
    if (!el) {
      return;
    }

    if (el instanceof HTMLSelectElement) {
      const values = Array.from(el.selectedOptions, (option) => option.value);
      this.capture("select", el, el.multiple ? values : (values[0] ?? ""));
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

      const value = this.isMasked(el) ? "[masked]" : el.value;
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
    const clickTarget = this.getClickableTarget(el);
    if (!clickTarget || this.shouldIgnore(clickTarget)) {
      return;
    }
    this.capture("click", clickTarget);
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

    this.capture("keyboard", el, event.key);
  }

  private onSubmit(event: SubmitEvent): void {
    const el = getEventTargetElement(event);
    if (el instanceof HTMLFormElement) {
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
