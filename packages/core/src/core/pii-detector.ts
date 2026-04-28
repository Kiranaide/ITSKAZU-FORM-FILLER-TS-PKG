import { matchesAnySelector } from "../utils/dom";
import type { FormScriptStep, SelectorStrategy } from "./schema";
import { extractSelectors, toFormSelectorStrategy } from "./selector";
import type { ElementSelector } from "./types";

export interface PIIMaskingConfig {
  enabled: boolean;
  selectors: string[];
  fields: PIIDetectionField[];
  maskValue: string;
}

export interface PIIDetectionField {
  type: "email" | "phone" | "ssn" | "credit-card" | "password" | "date-of-birth" | "custom";
  pattern?: RegExp;
  selector?: string;
}

const DEFAULT_MASK_SELECTORS = [
  '[type="password"]',
  '[autocomplete*="cc-number"]',
  '[autocomplete*="cc-csc"]',
  '[autocomplete*="cc-exp"]',
];

const BUILTIN_PATTERNS: Record<string, RegExp> = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone: /^\+?[\d\s\-().]{10,}$/,
  "credit-card": /^[\d\s-]{13,19}$/,
  ssn: /^\d{3}-\d{2}-\d{4}$/,
  "date-of-birth": /^\d{1,2}\/\d{1,2}\/\d{2,4}$/,
};

export function createDefaultPIIConfig(): PIIMaskingConfig {
  return {
    enabled: true,
    selectors: [...DEFAULT_MASK_SELECTORS],
    fields: [
      { type: "email", pattern: BUILTIN_PATTERNS["email"]! },
      { type: "phone", pattern: BUILTIN_PATTERNS["phone"]! },
      { type: "credit-card", pattern: BUILTIN_PATTERNS["credit-card"]! },
      { type: "ssn", pattern: BUILTIN_PATTERNS["ssn"]! },
      { type: "password" },
      { type: "date-of-birth", pattern: BUILTIN_PATTERNS["date-of-birth"]! },
    ],
    maskValue: "[masked]",
  };
}

export class PIIDetector {
  private config: PIIMaskingConfig;

  constructor(config: Partial<PIIMaskingConfig> = {}) {
    this.config = { ...createDefaultPIIConfig(), ...config };
  }

  shouldMask(element: Element): boolean {
    if (!this.config.enabled) return false;

    const selectors = this.config.selectors;
    if (matchesAnySelector(element, selectors)) {
      return true;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) {
      const value = element instanceof HTMLInputElement ? element.value : element.value;
      if (!value) return false;

      for (const field of this.config.fields) {
        if (field.pattern && field.pattern.test(value)) {
          return true;
        }
        const autocomplete = element.getAttribute("autocomplete")?.toLowerCase();
        if (autocomplete) {
          if (field.type === "email" && autocomplete.includes("email")) return true;
          if (field.type === "phone" && autocomplete.includes("tel")) return true;
          if (field.type === "credit-card" && autocomplete.includes("cc-number")) return true;
          if (field.type === "password" && autocomplete.includes("password")) return true;
        }
      }
    }

    return false;
  }

  maskValue(value: string, type?: string): string {
    return this.config.maskValue;
  }

  getConfig(): PIIMaskingConfig {
    return this.config;
  }

  updateConfig(config: Partial<PIIMaskingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function isMaskedField(selector: ElementSelector): boolean {
  const firstStrategy = selector.strategies[0];
  if (!firstStrategy) return false;

  const type = firstStrategy.value;
  if (type.includes("password") || type.includes("secret")) return true;

  return false;
}

export function maskStepValue(step: FormScriptStep): FormScriptStep {
  if (step.type !== "input") return step;

  return {
    ...step,
    value: step.masked ? "[masked]" : step.value,
  };
}
