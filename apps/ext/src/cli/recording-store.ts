import {
  type FormScript,
  type FormScriptStep,
  normalizeScriptInput,
  type RecordedAction,
  type RecordedScript,
} from "kazu-fira";
import type { SessionStep, StoredSessionV2 } from "../session-types.js";

export const SESSION_STORAGE_KEY_V2 = "kazu-fira:sessions:v2";
export const DEFAULT_MAX_SESSIONS = 50;

type BrowserContext = {
  url: string;
  userAgent: string;
};

function getBrowserContext(): BrowserContext {
  return {
    url: typeof location === "undefined" ? "" : location.href,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
  };
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function selectorToCss(
  selector: Exclude<FormScriptStep, { type: "wait" | "navigate" }>["selector"],
): string {
  if (selector.kind === "id") return `#${CSS.escape(selector.value)}`;
  if (selector.kind === "name") return `[name="${selector.value}"]`;
  if (selector.kind === "aria") return `[aria-label="${selector.value}"]`;
  if (selector.kind === "data") return `[${selector.attr}="${selector.value}"]`;
  return selector.value;
}

function scriptStepToSessionStep(step: FormScriptStep, fallbackTs: number): SessionStep {
  if (step.type === "wait") {
    return {
      type: step.type,
      scriptStep: step,
      selector: "",
      selectors: [],
      displayName: `Wait ${step.ms}ms`,
      tagName: "system",
      ms: step.ms,
      ts: fallbackTs,
    };
  }

  if (step.type === "navigate") {
    return {
      type: step.type,
      scriptStep: step,
      selector: step.url,
      selectors: [step.url],
      displayName: `Navigate to ${step.url}`,
      tagName: "navigation",
      url: step.url,
      ts: step.timestamp,
    };
  }

  const selector = selectorToCss(step.selector);
  return {
    type: step.type,
    scriptStep: step,
    selector,
    selectors: [selector],
    displayName: selector,
    tagName: step.type === "click" ? "button" : "field",
    value: step.type === "input" || step.type === "select" ? step.value : undefined,
    masked: step.type === "input" ? step.masked : undefined,
    ts: step.timestamp,
  };
}

function recordedActionMeta(action: RecordedAction) {
  const selectors = action.selector.strategies.map((strategy) => strategy.value);
  const primarySelector = selectors[0] ?? "";
  const fieldType = normalizeText(action.selector.fieldType);
  const displayName =
    normalizeText(action.metadata?.fieldLabel) ||
    normalizeText(action.selector.label) ||
    primarySelector ||
    fieldType ||
    action.type;

  return {
    selectors,
    primarySelector,
    displayName,
    tagName: fieldType || "field",
    inputType: fieldType.includes("[") ? fieldType.split("[")[1]?.replace("]", "") : undefined,
  };
}

function isStringArray(input: unknown): input is string[] {
  return Array.isArray(input) && input.every((item) => typeof item === "string");
}

function normalizeStoredStep(input: unknown, now: number): SessionStep | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as Partial<SessionStep>;
  if (!candidate.scriptStep || typeof candidate.scriptStep !== "object") return null;

  const fallback = scriptStepToSessionStep(candidate.scriptStep, now);
  return {
    ...fallback,
    selector: candidate.selector ?? fallback.selector,
    selectors: isStringArray(candidate.selectors) ? candidate.selectors : fallback.selectors,
    displayName:
      typeof candidate.displayName === "string" && candidate.displayName
        ? candidate.displayName
        : fallback.displayName,
    tagName:
      typeof candidate.tagName === "string" && candidate.tagName
        ? candidate.tagName
        : fallback.tagName,
    inputType:
      typeof candidate.inputType === "string" && candidate.inputType
        ? candidate.inputType
        : fallback.inputType,
    value: typeof candidate.value === "string" ? candidate.value : fallback.value,
    checked: typeof candidate.checked === "boolean" ? candidate.checked : fallback.checked,
    masked: typeof candidate.masked === "boolean" ? candidate.masked : fallback.masked,
    optionText:
      typeof candidate.optionText === "string" ? candidate.optionText : fallback.optionText,
    url: typeof candidate.url === "string" ? candidate.url : fallback.url,
    ms: typeof candidate.ms === "number" ? candidate.ms : fallback.ms,
    ts: typeof candidate.ts === "number" ? candidate.ts : fallback.ts,
  };
}

function normalizeSessions(input: unknown): StoredSessionV2[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<StoredSessionV2>;
    if (candidate.schemaVersion !== "2" || typeof candidate.id !== "string") return [];
    const now = Date.now() + index;
    const context = getBrowserContext();
    const steps = Array.isArray(candidate.steps)
      ? candidate.steps
          .map((step, stepIndex) => normalizeStoredStep(step, now + stepIndex))
          .filter((step): step is SessionStep => step !== null)
      : [];

    return [
      {
        id: candidate.id,
        schemaVersion: "2",
        name: typeof candidate.name === "string" ? candidate.name : "Recovered session",
        createdAt:
          typeof candidate.createdAt === "string"
            ? candidate.createdAt
            : new Date(now).toISOString(),
        url: typeof candidate.url === "string" ? candidate.url : context.url,
        userAgent:
          typeof candidate.userAgent === "string" ? candidate.userAgent : context.userAgent,
        steps,
        lastRunAt: typeof candidate.lastRunAt === "string" ? candidate.lastRunAt : undefined,
        originScriptId:
          typeof candidate.originScriptId === "string" ? candidate.originScriptId : undefined,
      },
    ];
  });
}

function sortSessions(sessions: StoredSessionV2[]): StoredSessionV2[] {
  return [...sessions].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function dedupeSessions(sessions: StoredSessionV2[]): StoredSessionV2[] {
  const byId = new Map<string, StoredSessionV2>();
  for (const session of sortSessions(sessions)) {
    if (!byId.has(session.id)) byId.set(session.id, session);
  }
  return [...byId.values()];
}

export function formScriptToStoredSession(
  script: FormScript,
  options: Partial<Pick<StoredSessionV2, "name" | "createdAt" | "url" | "userAgent" | "id">> = {},
): StoredSessionV2 {
  const context = getBrowserContext();
  return {
    id: options.id ?? script.id,
    schemaVersion: "2",
    name: options.name ?? script.name,
    createdAt: options.createdAt ?? new Date(script.createdAt).toISOString(),
    url: options.url ?? script.origin ?? context.url,
    userAgent: options.userAgent ?? context.userAgent,
    originScriptId: script.id,
    steps: script.steps.map((step, index) =>
      scriptStepToSessionStep(step, step.type === "wait" ? index : 0),
    ),
  };
}

export function recordedScriptToStoredSession(
  script: RecordedScript,
  options: Partial<Pick<StoredSessionV2, "name">> = {},
): StoredSessionV2 {
  const normalized = normalizeScriptInput(script);
  const session = formScriptToStoredSession(normalized, { name: options.name ?? script.name });
  const actions = script.actions ?? [];

  session.steps = normalized.steps.map((step, index) => {
    const fallback = scriptStepToSessionStep(step, step.type === "wait" ? index : 0);
    const action = actions[index];
    if (!action) return fallback;

    const meta = recordedActionMeta(action);
    return {
      ...fallback,
      selector: meta.primarySelector || fallback.selector,
      selectors: meta.selectors.length > 0 ? meta.selectors : fallback.selectors,
      displayName: meta.displayName,
      tagName: meta.tagName,
      inputType: meta.inputType ?? fallback.inputType,
    };
  });

  return session;
}

export function storedSessionToFormScript(session: StoredSessionV2): FormScript {
  const createdAt = +new Date(session.createdAt) || Date.now();
  return {
    version: 2,
    id: session.originScriptId ?? session.id,
    name: session.name,
    createdAt,
    updatedAt: Date.now(),
    origin: session.url,
    steps: session.steps.map((step) => step.scriptStep),
  };
}

export function readStoredSessions(storage: Storage = localStorage): StoredSessionV2[] {
  try {
    const existing = normalizeSessions(JSON.parse(storage.getItem(SESSION_STORAGE_KEY_V2) ?? "[]"));
    return sortSessions(dedupeSessions(existing));
  } catch {
    return [];
  }
}

export function writeStoredSessions(
  sessions: StoredSessionV2[],
  storage: Storage = localStorage,
  max = DEFAULT_MAX_SESSIONS,
): void {
  const bounded = sortSessions(sessions).slice(0, max);
  storage.setItem(SESSION_STORAGE_KEY_V2, JSON.stringify(bounded));
}

export function saveStoredSession(
  session: StoredSessionV2,
  storage: Storage = localStorage,
): StoredSessionV2[] {
  const sessions = readStoredSessions(storage);
  const next = [session, ...sessions.filter((it) => it.id !== session.id)];
  writeStoredSessions(next, storage);
  return sortSessions(next);
}

export function updateStoredSession(
  id: string,
  patch: Partial<Omit<StoredSessionV2, "id" | "schemaVersion">>,
  storage: Storage = localStorage,
): StoredSessionV2[] {
  const next = readStoredSessions(storage).map((session): StoredSessionV2 => {
    if (session.id !== id) return session;
    return {
      ...session,
      ...patch,
      id,
      schemaVersion: "2" as const,
    };
  });
  writeStoredSessions(next, storage);
  return sortSessions(next);
}

export function deleteStoredSession(
  id: string,
  storage: Storage = localStorage,
): StoredSessionV2[] {
  const next = readStoredSessions(storage).filter((it) => it.id !== id);
  writeStoredSessions(next, storage);
  return next;
}
