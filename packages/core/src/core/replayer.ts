import { sleep } from "../utils/timing";
import type { FormScript, FormScriptStep } from "./schema";
import { normalizeScriptInput as normalizeReplayScriptInput } from "./script-normalizer";
import { resolveByFormSelectorStrategy, selectorStrategyToQuery } from "./selector";
import type { ReplayOptions } from "./types";

export class Replayer {
  private options: ReplayOptions;
  private aborted = false;

  constructor(options: ReplayOptions) {
    this.options = options;
  }

  async play(): Promise<void> {
    const { speedMultiplier = 1, onError = () => "skip" } = this.options;
    const script = normalizeReplayScriptInput(this.options.script);
    this.options.hooks?.onReplayStart?.(script);

    let status: "success" | "error" = "success";
    if (!this.options.allowCrossOriginReplay) {
      const expectedOrigin = this.options.expectedOrigin ?? script.origin;
      if (expectedOrigin && expectedOrigin !== location.origin) {
        status = "error";
        const err = new Error(
          `Replay blocked by origin policy (expected ${expectedOrigin}, actual ${location.origin})`,
        );
        this.options.hooks?.onError?.(err, "replay");
        this.options.hooks?.onReplayEnd?.(script, status);
        return;
      }
    }

    for (const [index, step] of script.steps.entries()) {
      if (this.aborted) break;

      if (step.type === "wait") {
        if (step.ms > 0 && speedMultiplier > 0) {
          await sleep(step.ms / speedMultiplier);
        }
        continue;
      }

      const shouldProceed = (await this.options.onBeforeAction?.(step)) ?? true;
      if (!shouldProceed) continue;

      if (step.type === "navigate") continue;

      const el = await resolveElementWithRetry(step.selector);
      if (!el) {
        status = "error";
        const err = new Error(buildMissingElementMessage(step));
        this.options.hooks?.onError?.(err, "replay");
        const resolution = await onError(step, err);
        if (resolution === "abort") {
          this.aborted = true;
          break;
        }
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
        const resolution = await onError(step, error as Error);
        if (resolution === "abort") {
          this.aborted = true;
          break;
        }
      }

      this.options.onAfterAction?.(step, el);
      this.options.hooks?.onReplayStep?.(step, index);
    }

    this.options.hooks?.onReplayEnd?.(script, status);
  }

  abort(): void {
    this.aborted = true;
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
  if (el.disabled) {
    return;
  }
  if (el.readOnly) {
    return;
  }

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
  nativeValueSetter: ((this: HTMLInputElement | HTMLTextAreaElement, v: string) => void) | undefined,
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

function buildMissingElementMessage(step: Exclude<FormScriptStep, { type: "wait" | "navigate" }>): string {
  const query = selectorStrategyToQuery(step.selector);
  const reactSelectHint = describeReactSelectLookup(step.selector);
  const combobox = document.querySelector("input[role='combobox'][id^='react-select-']");
  const comboboxState =
    combobox instanceof HTMLInputElement
      ? `open=${combobox.getAttribute("aria-expanded") ?? "unknown"}, active=${combobox.getAttribute("aria-activedescendant") ?? ""}`
      : "no-combobox";
  const hint = reactSelectHint ? `, ${reactSelectHint}` : "";
  return `Element not found (query="${query}"${hint}, ${comboboxState})`;
}

function describeReactSelectLookup(
  selector: Exclude<FormScriptStep, { type: "wait" | "navigate" }>["selector"],
): string {
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

async function resolveElementWithRetry(
  selector: Exclude<FormScriptStep, { type: "wait" | "navigate" }>["selector"],
): Promise<Element | null> {
  const timeoutMs = 1200;
  const intervalMs = 120;
  const start = Date.now();

  while (Date.now() - start <= timeoutMs) {
    const found = resolveByFormSelectorStrategy(selector);
    if (found) {
      return found;
    }
    await sleep(intervalMs);
  }

  return resolveByFormSelectorStrategy(selector);
}
