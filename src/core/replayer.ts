import { highlightElement } from "../overlay/indicator";
import { sleep } from "../utils/timing";
import { migrateScript } from "./migrations";
import type { FormScript, FormScriptStep } from "./schema";
import { resolveByFormSelectorStrategy } from "./selector";
import type { RecordedScript, ReplayOptions } from "./types";

export class Replayer {
  private options: ReplayOptions;
  private aborted = false;

  constructor(options: ReplayOptions) {
    this.options = options;
  }

  async play(): Promise<void> {
    const { speedMultiplier = 1, onError = () => "skip" } = this.options;
    const script = normalizeScript(this.options.script);
    this.options.hooks?.onReplayStart?.(script);

    let status: "success" | "error" = "success";
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

      const el = resolveByFormSelectorStrategy(step.selector);
      if (!el) {
        status = "error";
        const err = new Error("Element not found");
        this.options.hooks?.onError?.(err, "replay");
        const resolution = await onError(step, err);
        if (resolution === "abort") {
          this.aborted = true;
          break;
        }
        continue;
      }

      if (this.options.highlight) {
        highlightElement(el);
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
    (el as HTMLElement).click();
  }
}

async function setInputValue(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): Promise<void> {
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

  nativeValueSetter?.call(el, value);
  if (el.value !== value) {
    el.value = value;
  }

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

function normalizeScript(raw: ReplayOptions["script"]): FormScript {
  if ("steps" in raw && Array.isArray(raw.steps)) {
    return migrateScript(raw);
  }

  const legacy = raw as RecordedScript;
  const now = Date.now();
  const steps: FormScriptStep[] = [];
  for (const action of legacy.actions ?? []) {
    const first = action.selector.strategies[0];
    if (!first) continue;

    const selector =
      first.type === "id"
        ? { kind: "id" as const, value: first.value.replace(/^#/, "") }
        : { kind: "css" as const, value: first.value };

    if (action.type === "input" || action.type === "change") {
      steps.push({
        type: "input",
        selector,
        value: String(action.value ?? ""),
        masked: String(action.value ?? "") === "[masked]",
        timestamp: action.timestamp,
      });
      continue;
    }

    if (action.type === "select") {
      steps.push({
        type: "select",
        selector,
        value: Array.isArray(action.value) ? action.value.join("||") : String(action.value ?? ""),
        timestamp: action.timestamp,
      });
      continue;
    }

    if (action.type === "checkbox") {
      steps.push({
        type: "input",
        selector,
        value: String(Boolean(action.value)),
        masked: false,
        timestamp: action.timestamp,
      });
      continue;
    }

    if (action.type === "radio") {
      steps.push({
        type: "click",
        selector: {
          kind: "css",
          value: `input[type="radio"][value="${String(action.value ?? "")}"]`,
        },
        timestamp: action.timestamp,
      });
      continue;
    }

    if (action.type === "focus") {
      steps.push({ type: "click", selector, timestamp: action.timestamp });
      continue;
    }

    if (action.type === "click" || action.type === "submit") {
      steps.push({ type: "click", selector, timestamp: action.timestamp });
    }
  }

  return {
    version: 2,
    id: legacy.id ?? `legacy-${now}`,
    name: legacy.name,
    createdAt: typeof legacy.createdAt === "number" ? legacy.createdAt : now,
    updatedAt: now,
    origin: new URL(legacy.url ?? location.href).origin,
    steps,
  };
}
