import type { SelectorStrategy as FormSelectorStrategy } from "./schema";
import type { ElementSelector, SelectorStrategy } from "./types";

export const STRATEGY_PRIORITY = ["id", "name", "data-testid", "aria-label", "css"] as const;

export function extractSelectors(el: Element): ElementSelector {
  const strategies: SelectorStrategy[] = [];

  if (el.id && !isDynamicId(el.id)) {
    strategies.push({
      type: "id",
      value: `#${CSS.escape(el.id)}`,
      confidence: 1.0,
    });
  }

  const name = (el as HTMLInputElement).name;
  if (name) {
    strategies.push({
      type: "name",
      value: `[name="${name}"]`,
      confidence: 0.9,
    });
  }

  for (const attr of ["data-testid", "data-cy", "data-qa", "data-id"]) {
    const val = el.getAttribute(attr);
    if (val) {
      strategies.push({
        type: "data-testid",
        value: `[${attr}="${val}"]`,
        confidence: 0.95,
      });
    }
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    strategies.push({
      type: "aria-label",
      value: `[aria-label="${ariaLabel}"]`,
      confidence: 0.85,
    });
  }

  strategies.push({
    type: "css",
    value: buildShortCSSSelector(el),
    confidence: 0.6,
  });

  const label = getAssociatedLabel(el);

  return {
    strategies: strategies.sort((a, b) => b.confidence - a.confidence),
    label,
    fieldType: (el as HTMLInputElement).type ?? el.tagName.toLowerCase(),
  };
}

export function resolveElement(
  selector: ElementSelector,
  root: Document | ShadowRoot = document,
): Element | null {
  for (const strategy of selector.strategies) {
    try {
      const el = root.querySelector(strategy.value);
      if (el) return el;
    } catch {}
  }
  return resolveThroughShadowDOM(selector);
}

export function toFormSelectorStrategy(selector: ElementSelector): FormSelectorStrategy {
  const strategy = selector.strategies[0];
  if (!strategy) {
    return { kind: "css", value: "*" };
  }

  if (strategy.type === "id") {
    return { kind: "id", value: strategy.value.replace(/^#/, "") };
  }

  if (strategy.type === "name") {
    const m = strategy.value.match(/^\[name="(.+)"\]$/);
    return { kind: "name", value: m?.[1] ?? strategy.value };
  }

  if (strategy.type === "aria-label") {
    const m = strategy.value.match(/^\[aria-label="(.+)"\]$/);
    return { kind: "aria", value: m?.[1] ?? strategy.value };
  }

  if (strategy.type === "data-testid") {
    const m = strategy.value.match(/^\[([^=]+)="(.+)"\]$/);
    return { kind: "data", attr: m?.[1] ?? "data-testid", value: m?.[2] ?? strategy.value };
  }

  return { kind: "css", value: strategy.value };
}

export function resolveByFormSelectorStrategy(
  selector: FormSelectorStrategy,
  root: Document | ShadowRoot = document,
): Element | null {
  const query =
    selector.kind === "id"
      ? `#${CSS.escape(selector.value)}`
      : selector.kind === "name"
        ? `[name="${selector.value}"]`
        : selector.kind === "aria"
          ? `[aria-label="${selector.value}"]`
          : selector.kind === "data"
            ? `[${selector.attr}="${selector.value}"]`
            : selector.value;

  try {
    const direct = root.querySelector(query);
    if (direct) {
      return direct;
    }
  } catch {}

  const allElements = root.querySelectorAll("*");
  for (const el of allElements) {
    if (!el.shadowRoot) {
      continue;
    }
    const nested = resolveByFormSelectorStrategy(selector, el.shadowRoot);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function isDynamicId(id: string): boolean {
  return /^(:r\d|react-aria|ember\d|\d)/.test(id);
}

function buildShortCSSSelector(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type;
  const classes = [...el.classList]
    .filter((c) => !isDynamicClass(c))
    .slice(0, 2)
    .join(".");

  return [tag, type && `[type="${type}"]`, classes && `.${classes}`].filter(Boolean).join("");
}

function isDynamicClass(cls: string): boolean {
  return /^(css-|sc-|__[A-Z]|\w{20,})/.test(cls);
}

function getAssociatedLabel(el: Element): string | undefined {
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent?.trim();
  }

  const parent = el.closest("label");
  if (parent) return parent.textContent?.trim();

  return el.getAttribute("aria-label") ?? undefined;
}

function resolveThroughShadowDOM(selector: ElementSelector): Element | null {
  function walkShadow(root: Document | ShadowRoot): Element | null {
    for (const strategy of selector.strategies) {
      try {
        const el = root.querySelector(strategy.value);
        if (el) return el;
      } catch {}
    }
    const allElements = root.querySelectorAll("*");
    for (const el of allElements) {
      if (el.shadowRoot) {
        const found = walkShadow(el.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }
  return walkShadow(document);
}
