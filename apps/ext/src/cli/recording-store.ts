import type { FormScript, FormScriptStep } from "kazu-fira";
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

function _normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function selectorToCss(
  selector: Exclude<FormScriptStep, { type: "wait" | "navigate" | "assert" }>["selector"],
): string {
  if (!selector) return "";
  if (selector.kind === "id") return `#${CSS.escape(selector.value)}`;
  if (selector.kind === "name") return `[name="${CSS.escape(selector.value)}"]`;
  if (selector.kind === "aria") return `[aria-label="${CSS.escape(selector.value)}"]`;
  if (selector.kind === "data")
    return `[data-${CSS.escape(selector.attr)}="${CSS.escape(selector.value)}"]`;
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

  if (step.type === "assert") {
    return {
      type: step.type,
      scriptStep: step,
      selector: step.selector ? selectorToCss(step.selector) : "",
      selectors: step.selector ? [selectorToCss(step.selector)] : [],
      displayName: `Assert ${step.assertion}`,
      tagName: "assertion",
      ts: step.timestamp,
    };
  }

  const sel = "selector" in step ? step.selector : undefined;
  const selector = sel ? selectorToCss(sel) : "";
  return {
    type: step.type,
    scriptStep: step,
    selector,
    selectors: [selector],
    displayName: stepToDisplayName(step) || selector,
    tagName: step.type === "click" ? "button" : "field",
    value: step.type === "input" || step.type === "select" ? step.value : undefined,
    ts: step.timestamp,
  };
}

function stepToDisplayName(step: FormScriptStep): string {
  if (step.type === "wait") return `Wait ${step.ms}ms`;
  if (step.type === "navigate") return `Navigate to ${step.url}`;
  if (step.type === "assert") return `Assert ${step.assertion}`;
  if (step.type === "input") return step.value;
  if (step.type === "select") return step.value;
  if (step.type === "keyboard") return step.key;
  if (step.type === "click") return "Click";
  return "";
}

export function recordedScriptToStoredSession(formScript: FormScript): StoredSessionV2 {
  return {
    id: formScript.id,
    name: formScript.name,
    origin: formScript.origin,
    createdAt: formScript.createdAt,
    updatedAt: formScript.updatedAt,
    steps: formScript.steps.map((step, i) => scriptStepToSessionStep(step, i * 100)),
    viewState: {
      scrollX: 0,
      scrollY: 0,
      viewport: { w: 1920, h: 1080 },
    },
    browser: getBrowserContext(),
    metadata: {
      title: formScript.name,
      description: `${formScript.steps.length} steps`,
      duration: formScript.steps.reduce(
        (acc, step) => acc + (step.type === "wait" ? step.ms : 0),
        0,
      ),
    },
  };
}

export function storedSessionToFormScript(session: StoredSessionV2): FormScript {
  return {
    version: 2,
    id: session.id,
    name: session.name,
    origin: session.origin,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    steps: session.steps.map((s) => s.scriptStep).filter(Boolean),
  };
}

export function readStoredSessions(storage: Storage = localStorage): StoredSessionV2[] {
  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY_V2);
    if (!raw) return [];
    const sessions = JSON.parse(raw) as StoredSessionV2[];
    let migrated = false;
    for (const session of sessions) {
      if (session.id === "__draft__") {
        session.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        migrated = true;
      }
    }
    if (migrated) {
      writeStoredSessions(sessions, storage);
    }
    return sessions;
  } catch {
    return [];
  }
}

export function writeStoredSessions(
  sessions: StoredSessionV2[],
  storage: Storage = localStorage,
): void {
  const trimmed = sessions.slice(0, DEFAULT_MAX_SESSIONS);
  storage.setItem(SESSION_STORAGE_KEY_V2, JSON.stringify(trimmed));
}

export function saveStoredSession(session: StoredSessionV2, storage: Storage = localStorage): void {
  const sessions = readStoredSessions(storage);
  const existing = sessions.findIndex((s) => s.id === session.id);
  if (existing >= 0) {
    sessions[existing] = session;
  } else {
    sessions.unshift(session);
  }
  writeStoredSessions(sessions, storage);
}

export function deleteStoredSession(id: string, storage: Storage = localStorage): void {
  const sessions = readStoredSessions(storage).filter((s) => s.id !== id);
  writeStoredSessions(sessions, storage);
}

export function updateStoredSession(
  id: string,
  update: ((session: StoredSessionV2) => StoredSessionV2) | Partial<StoredSessionV2>,
  storage: Storage = localStorage,
): void {
  const sessions = readStoredSessions(storage);
  const index = sessions.findIndex((s) => s.id === id);
  if (index >= 0 && sessions[index]) {
    const updated =
      typeof update === "function" ? update(sessions[index]) : { ...sessions[index], ...update };
    sessions[index] = updated;
    writeStoredSessions(sessions, storage);
  }
}
