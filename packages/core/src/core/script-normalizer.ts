import { migrateScript } from "./migrations";
import type { FormScript, FormScriptStep } from "./schema";
import { fromSelectorStrategy } from "./selector";
import type { LegacyRecordedScript, RecordedAction, ReplayOptions } from "./types";

function toScriptOrigin(url?: string): string {
  const fallback = typeof location === "undefined" ? "https://localhost" : location.href;
  return new URL(url ?? fallback).origin;
}

function actionToStep(action: RecordedAction): FormScriptStep | null {
  const first = action.selector.strategies[0];
  if (!first) return null;
  const selector = fromSelectorStrategy(first);

  if (action.type === "input" || action.type === "change") {
    return {
      type: "input",
      selector,
      value: String(action.value ?? ""),
      masked: String(action.value ?? "") === "[masked]",
      timestamp: action.timestamp,
    };
  }

  if (action.type === "select") {
    return {
      type: "select",
      selector,
      value: Array.isArray(action.value) ? action.value.join("||") : String(action.value ?? ""),
      timestamp: action.timestamp,
    };
  }

  if (action.type === "checkbox") {
    return {
      type: "input",
      selector,
      value: String(Boolean(action.value)),
      masked: false,
      timestamp: action.timestamp,
    };
  }

  if (action.type === "radio") {
    return {
      type: "click",
      selector: {
        kind: "css",
        value: `input[type="radio"][value="${String(action.value ?? "")}"]`,
      },
      timestamp: action.timestamp,
    };
  }

  if (action.type === "focus") {
    return { type: "click", selector, timestamp: action.timestamp };
  }

  if (action.type === "keyboard") {
    return {
      type: "keyboard",
      selector,
      key: String(action.value ?? ""),
      timestamp: action.timestamp,
    };
  }

  if (action.type === "click" || action.type === "submit") {
    return { type: "click", selector, timestamp: action.timestamp };
  }

  return null;
}

type LegacyLikeScript = Pick<LegacyRecordedScript, "id" | "name" | "createdAt" | "url" | "actions">;

function fromLegacyScript(raw: LegacyLikeScript): FormScript {
  const now = Date.now();
  const steps = (raw.actions ?? [])
    .map((action) => actionToStep(action))
    .filter((step): step is FormScriptStep => step !== null);

  return {
    version: 2,
    id: raw.id ?? `legacy-${now}`,
    name: raw.name,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : now,
    updatedAt: now,
    origin: toScriptOrigin(raw.url),
    steps,
  };
}

export function normalizeScriptInput(raw: ReplayOptions["script"]): FormScript {
  if ("version" in raw && raw.version === "1") {
    return fromLegacyScript(raw);
  }
  return migrateScript(raw);
}
