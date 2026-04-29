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
      source: "id",
    });
  }

  const name = (el as HTMLInputElement).name;
  if (name) {
    strategies.push({
      type: "name",
      value: `[name="${name}"]`,
      confidence: 0.9,
      source: "name",
    });
  }

  for (const attr of ["data-testid", "data-cy", "data-qa", "data-id"]) {
    const val = el.getAttribute(attr);
    if (val) {
      strategies.push({
        type: "data-testid",
        value: `[${attr}="${val}"]`,
        confidence: 0.95,
        source: "testid",
      });
    }
  }

  const attrConfidence: Record<string, number> = {
    placeholder: 0.97,
    inputmode: 0.94,
    autocomplete: 0.84,
    readonly: 0.8,
    "aria-describedby": 0.72,
  };
  for (const attr of Object.keys(attrConfidence)) {
    const val =
      attr === "readonly" ? (el.hasAttribute("readonly") ? "true" : "") : el.getAttribute(attr);
    if (!val) {
      continue;
    }
    const attributeValue = attr === "readonly" ? "true" : val;
    const escaped = escapeAttributeValue(attributeValue);
    const selectorValue = attr === "readonly" ? `[readonly]` : `[${attr}="${escaped}"]`;
    const unique = isUniqueSelector(selectorValue, el);
    const confidenceBoost =
      attr === "aria-describedby" && /^react-select-\d+-placeholder$/.test(attributeValue)
        ? -0.18
        : 0;
    const uniquenessPenalty = unique ? 0 : -0.35;
    if (attr === "readonly" && !unique) {
      continue;
    }
    strategies.push({
      type: attr === "readonly" ? "css" : "data-testid",
      value: selectorValue,
      confidence: Math.max(
        0.4,
        (attrConfidence[attr] ?? 0.8) + confidenceBoost + uniquenessPenalty,
      ),
      source: attr === "placeholder" ? "placeholder" : "testid",
    });
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    strategies.push({
      type: "aria-label",
      value: `[aria-label="${ariaLabel}"]`,
      confidence: 0.85,
      source: "label",
    });
  }

  strategies.push({
    type: "css",
    value: buildShortCSSSelector(el),
    confidence: 0.6,
    source: "css",
  });

  const label = getAssociatedLabel(el);

  const ranked = strategies.sort((a, b) => b.confidence - a.confidence);
  const top = ranked[0];
  const result: ElementSelector = {
    strategies: ranked,
    fieldType: (el as HTMLInputElement).type ?? el.tagName.toLowerCase(),
    source: top?.source ?? "css",
    confidence: toConfidenceLabel(top?.confidence ?? 0),
  };

  if (label) {
    result.label = label;
  }

  return result;
}

function toConfidenceLabel(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
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

export function fromSelectorStrategy(strategy: SelectorStrategy): FormSelectorStrategy {
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

export function selectorStrategyToQuery(selector: FormSelectorStrategy): string {
  return selector.kind === "id"
    ? queryById(selector.value)
    : selector.kind === "name"
      ? `[name="${selector.value}"]`
      : selector.kind === "aria"
        ? `[aria-label="${selector.value}"]`
        : selector.kind === "data"
          ? `[${selector.attr}="${selector.value}"]`
          : selector.value;
}

function queryById(id: string): string {
  const escaped = CSS.escape(id);
  const fallbackSuffix = getReactSelectStableSuffix(id);
  if (!fallbackSuffix) {
    return `#${escaped}`;
  }
  if (fallbackSuffix === "-input") {
    return `#${escaped}`;
  }
  return `#${escaped}, [id$="${fallbackSuffix}"]`;
}

function getReactSelectStableSuffix(id: string): string | null {
  const match = id.match(/^react-select-\d+-(input|listbox|option-\d+|value)$/);
  if (!match) {
    return null;
  }
  return `-${match[1]}`;
}

export function resolveByFormSelectorStrategy(
  selector: FormSelectorStrategy,
  root: Document | ShadowRoot = document,
): Element | null {
  const query = selectorStrategyToQuery(selector);

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

  const reactSelectFallback = resolveReactSelectFallback(selector, root);
  if (reactSelectFallback) {
    return reactSelectFallback;
  }

  const reactDatePickerFallback = resolveReactDatePickerFallback(selector, root);
  if (reactDatePickerFallback) {
    return reactDatePickerFallback;
  }

  return null;
}

function isDynamicId(id: string): boolean {
  return /^(:r\d|react-aria|ember\d|\d|react-select-\d+-(input|listbox|option-\d+|placeholder|live-region|value))/.test(
    id,
  );
}

function buildShortCSSSelector(el: Element): string {
  const unique = buildUniqueCSSSelector(el);
  if (unique) {
    return unique;
  }

  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type;
  const classes = [...el.classList]
    .filter((c) => !isDynamicClass(c))
    .slice(0, 2)
    .join(".");

  return [tag, type && `[type="${type}"]`, classes && `.${classes}`].filter(Boolean).join("");
}

function buildUniqueCSSSelector(el: Element): string | null {
  const self = buildElementSegment(el, { includeNthOfType: false });
  if (isUniqueSelector(self, el)) {
    return self;
  }

  const withNth = buildElementSegment(el, { includeNthOfType: true });
  if (isUniqueSelector(withNth, el)) {
    return withNth;
  }

  let current: Element | null = el;
  const segments: string[] = [];
  while (current && current !== document.documentElement) {
    segments.unshift(buildElementSegment(current, { includeNthOfType: true }));
    const candidate = segments.join(" > ");
    if (isUniqueSelector(candidate, el)) {
      return candidate;
    }
    current = current.parentElement;
  }

  return null;
}

function buildElementSegment(el: Element, options: { includeNthOfType: boolean }): string {
  const tag = el.tagName.toLowerCase();
  const type = (el as HTMLInputElement).type;
  const classes = [...el.classList]
    .filter((c) => !isDynamicClass(c))
    .slice(0, 2)
    .map((cls) => `.${CSS.escape(cls)}`)
    .join("");

  let segment = [tag, type && `[type="${type}"]`, classes].filter(Boolean).join("");
  if (!options.includeNthOfType || !el.parentElement) {
    return segment;
  }

  const siblings = Array.from(el.parentElement.children).filter(
    (candidate) => candidate.tagName === el.tagName,
  );
  if (siblings.length > 1) {
    const nth = siblings.indexOf(el) + 1;
    if (nth > 0) {
      segment += `:nth-of-type(${nth})`;
    }
  }
  return segment;
}

function isUniqueSelector(selector: string, target: Element): boolean {
  if (!selector) {
    return false;
  }

  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === target;
  } catch {
    return false;
  }
}

function escapeAttributeValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

function resolveReactSelectFallback(
  selector: FormSelectorStrategy,
  root: Document | ShadowRoot,
): Element | null {
  if (selector.kind !== "id") {
    return null;
  }

  const inputMatch = selector.value.match(/^react-select-\d+-input$/);
  if (inputMatch) {
    const input = root.querySelector(`#${CSS.escape(selector.value)}`);
    return input instanceof Element ? input : null;
  }

  const optionMatch = selector.value.match(/^react-select-\d+-option-(\d+)$/);
  if (!optionMatch) {
    return null;
  }

  const optionIndex = Number(optionMatch[1]);
  if (!Number.isFinite(optionIndex)) {
    return null;
  }

  const menuOptions = root.querySelectorAll(
    "[class*='-menu'] [role='option'], [class*='-menu'] [id*='-option-']",
  );
  const optionByIndex = menuOptions[optionIndex];
  return optionByIndex instanceof Element ? optionByIndex : null;
}

function resolveReactDatePickerFallback(
  selector: FormSelectorStrategy,
  root: Document | ShadowRoot,
): Element | null {
  if (selector.kind === "css") {
    if (selector.value.includes("react-datepicker__month-select")) {
      const month = root.querySelector("select.react-datepicker__month-select");
      return month instanceof Element ? month : null;
    }
    if (selector.value.includes("react-datepicker__year-select")) {
      const year = root.querySelector("select.react-datepicker__year-select");
      return year instanceof Element ? year : null;
    }
  }

  if (selector.kind === "aria" && selector.value.startsWith("Choose ")) {
    const exact = root.querySelector(`[aria-label="${selector.value}"]`);
    if (exact instanceof Element) {
      return exact;
    }

    const parsed = selector.value.match(/,\s+([A-Za-z]+)\s+(\d+)(?:st|nd|rd|th),\s+(\d{4})$/);
    if (!parsed) {
      return null;
    }

    const [, month, day, year] = parsed;
    const candidates = root.querySelectorAll(`[aria-label*="${month}"][aria-label*="${year}"]`);
    for (const candidate of candidates) {
      const label = candidate.getAttribute("aria-label") ?? "";
      if (new RegExp(`\\b${day}(st|nd|rd|th)?\\b`).test(label)) {
        return candidate;
      }
    }
  }

  return null;
}
