import { extractSelectors } from "./selector";
import type { RecordedAction, RecordedScript, RecorderOptions } from "./types";
import { nanoid } from "../utils/nanoid";
import { getEventTargetElement, isFormField, matchesAnySelector } from "../utils/dom";
import { watchOpenShadowRoots } from "../adapters/shadow-dom";

const DEFAULT_MASK_SELECTORS = [
  '[type="password"]',
  '[autocomplete*="cc-number"]',
  '[autocomplete*="cc-csc"]',
];

export class Recorder {
  private actions: RecordedAction[] = [];
  private startTime = 0;
  private lastActionTime = 0;
  private options: RecorderOptions;
  private controllers: AbortController[] = [];
  private stopWatchingShadowRoots?: () => void;

  constructor(options: RecorderOptions = {}) {
    this.options = options;
  }

  start(): void {
    this.actions = [];
    this.startTime = performance.now();
    this.lastActionTime = this.startTime;

    const root = this.options.root ?? document.body;
    this.attachListeners(root);

    this.stopWatchingShadowRoots = watchOpenShadowRoots((shadowRoot) => {
      this.attachListeners(shadowRoot);
    });
  }

  stop(): RecordedScript {
    this.controllers.forEach((controller) => controller.abort());
    this.controllers = [];
    this.stopWatchingShadowRoots?.();
    this.stopWatchingShadowRoots = undefined;

    return {
      version: "1",
      name: `Recording ${new Date().toISOString()}`,
      url: location.href,
      createdAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
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
    root.addEventListener("submit", (event) => this.onSubmit(event as SubmitEvent), {
      signal,
      capture: true,
    });
  }

  private capture(type: RecordedAction["type"], el: Element, value?: string | boolean | string[]): void {
    if (this.shouldIgnore(el)) {
      return;
    }

    const now = performance.now();
    const delay = now - this.lastActionTime;
    this.lastActionTime = now;

    const selector = extractSelectors(el);
    const action: RecordedAction = {
      id: nanoid(),
      type,
      selector,
      value,
      timestamp: now - this.startTime,
      delay: this.options.captureDelay === false ? 0 : delay,
      metadata: {
        url: location.href,
        viewport: { w: window.innerWidth, h: window.innerHeight },
        fieldLabel: selector.label,
      },
    };

    this.actions.push(action);
    this.options.onAction?.(action);
  }

  private shouldIgnore(el: Element): boolean {
    return matchesAnySelector(el, this.options.ignore ?? []);
  }

  private isMasked(el: Element): boolean {
    return matchesAnySelector(el, [...DEFAULT_MASK_SELECTORS, ...(this.options.mask ?? [])]);
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
      this.capture("select", el, el.multiple ? values : values[0] ?? "");
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

    if (el instanceof HTMLButtonElement || el.getAttribute("role") === "button") {
      this.capture("click", el);
    }
  }

  private onSubmit(event: SubmitEvent): void {
    const el = getEventTargetElement(event);
    if (el instanceof HTMLFormElement) {
      this.capture("submit", el);
    }
  }
}
