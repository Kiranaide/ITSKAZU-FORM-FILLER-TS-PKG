import type { ElementSelector, SelectorStrategy } from "./types";

export const STRATEGY_PRIORITY = [
  "id",
  "name",
  "data-testid",
  "aria-label",
  "css",
] as const;

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

  return [tag, type && `[type="${type}"]`, classes && `.${classes}`]
    .filter(Boolean)
    .join("");
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
