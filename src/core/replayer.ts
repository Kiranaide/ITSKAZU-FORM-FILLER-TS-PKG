import { resolveElement } from "./selector";
import type { RecordedAction, ReplayOptions } from "./types";
import { highlightElement } from "../overlay/indicator";
import { sleep } from "../utils/timing";

export class Replayer {
  private options: ReplayOptions;
  private aborted = false;

  constructor(options: ReplayOptions) {
    this.options = options;
  }

  async play(): Promise<void> {
    const { script, speedMultiplier = 1, onError = () => "skip" } = this.options;

    for (const action of script.actions) {
      if (this.aborted) {
        break;
      }

      if (action.delay > 0 && speedMultiplier > 0) {
        await sleep(action.delay / speedMultiplier);
      }

      const shouldProceed = (await this.options.onBeforeAction?.(action)) ?? true;
      if (!shouldProceed) {
        continue;
      }

      const el = resolveElement(action.selector);
      if (!el) {
        const resolution = onError(action, new Error("Element not found"));
        if ((await resolution) === "abort") {
          this.aborted = true;
          break;
        }
        continue;
      }

      if (this.options.highlight) {
        highlightElement(el);
      }

      try {
        await this.executeAction(action, el);
      } catch (error) {
        const resolution = await onError(action, error as Error);
        if (resolution === "abort") {
          this.aborted = true;
          break;
        }
      }

      this.options.onAfterAction?.(action, el);
    }
  }

  abort(): void {
    this.aborted = true;
  }

  private async executeAction(action: RecordedAction, el: Element): Promise<void> {
    (el as HTMLElement).scrollIntoView({ block: "nearest", behavior: "smooth" });

    switch (action.type) {
      case "input":
      case "change":
        await setInputValue(el as HTMLInputElement | HTMLTextAreaElement, String(action.value ?? ""));
        break;
      case "select":
        setSelectValue(el as HTMLSelectElement, action.value as string | string[]);
        break;
      case "checkbox":
        setCheckbox(el as HTMLInputElement, Boolean(action.value));
        break;
      case "radio":
        setRadio(el as HTMLInputElement, String(action.value ?? ""));
        break;
      case "focus":
        (el as HTMLElement).focus();
        break;
      case "blur":
        (el as HTMLElement).blur();
        break;
      case "click":
        (el as HTMLElement).click();
        break;
      case "submit":
        el.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        break;
      default:
        break;
    }
  }
}

async function setInputValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  const prototype = el instanceof HTMLTextAreaElement
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;

  const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  nativeValueSetter?.call(el, value);
  if (el.value !== value) {
    el.value = value;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setSelectValue(el: HTMLSelectElement, value: string | string[]): void {
  if (Array.isArray(value)) {
    for (const option of el.options) {
      option.selected = value.includes(option.value);
    }
  } else {
    el.value = value;
  }

  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setCheckbox(el: HTMLInputElement, checked: boolean): void {
  el.checked = checked;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function setRadio(el: HTMLInputElement, value: string): void {
  const form = el.closest("form");
  const name = el.name;
  const target = (form ?? document).querySelector<HTMLInputElement>(
    `input[type="radio"][name="${name}"][value="${value}"]`,
  );

  if (target) {
    target.checked = true;
    target.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
