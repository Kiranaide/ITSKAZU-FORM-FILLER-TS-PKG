import type { StoredSessionV2 } from "../core/types.js";

export const SESSION_STORAGE_KEY_V2 = "itskazu-form-filler:sessions:v2";
export const SESSION_STORAGE_KEY_LEGACY = "itskazu-form-filler:latest-recording";
export const DEFAULT_MAX_SESSIONS = 50;

type LegacyStep = { type: string; selector: string; value?: string; checked?: boolean };

function normalizeSessions(input: unknown): StoredSessionV2[] {
  if (!Array.isArray(input)) return [];
  return input.filter((it): it is StoredSessionV2 => {
    if (!it || typeof it !== "object") return false;
    const candidate = it as Partial<StoredSessionV2>;
    return candidate.schemaVersion === "2" && typeof candidate.id === "string" && Array.isArray(candidate.steps);
  });
}

export function migrateLegacySteps(steps: LegacyStep[], now = Date.now()): StoredSessionV2 {
  return {
    id: `legacy-${now}`,
    schemaVersion: "2",
    name: "Migrated session",
    createdAt: new Date(now).toISOString(),
    url: typeof location === "undefined" ? "" : location.href,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    steps: steps.map((step, idx) => ({
      type: step.type === "check" || step.type === "click" || step.type === "keyboard" ? step.type : "fill",
      selector: step.selector,
      selectors: [step.selector],
      displayName: step.selector,
      tagName: "field",
      value: step.value,
      checked: step.checked,
      ts: now + idx,
    })),
  };
}

export function readStoredSessions(storage: Storage = localStorage): StoredSessionV2[] {
  try {
    const raw = storage.getItem(SESSION_STORAGE_KEY_V2);
    if (raw) return normalizeSessions(JSON.parse(raw));
    const legacyRaw = storage.getItem(SESSION_STORAGE_KEY_LEGACY);
    if (!legacyRaw) return [];
    const legacySteps = JSON.parse(legacyRaw) as LegacyStep[];
    if (!Array.isArray(legacySteps) || legacySteps.length === 0) return [];
    const migrated = migrateLegacySteps(legacySteps);
    storage.setItem(SESSION_STORAGE_KEY_V2, JSON.stringify([migrated]));
    return [migrated];
  } catch {
    return [];
  }
}

export function writeStoredSessions(sessions: StoredSessionV2[], storage: Storage = localStorage, max = DEFAULT_MAX_SESSIONS): void {
  const bounded = sessions.slice(0, max);
  storage.setItem(SESSION_STORAGE_KEY_V2, JSON.stringify(bounded));
}

export function saveStoredSession(session: StoredSessionV2, storage: Storage = localStorage): StoredSessionV2[] {
  const sessions = readStoredSessions(storage);
  const next = [session, ...sessions.filter((it) => it.id !== session.id)].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  writeStoredSessions(next, storage);
  return next;
}

export function deleteStoredSession(id: string, storage: Storage = localStorage): StoredSessionV2[] {
  const next = readStoredSessions(storage).filter((it) => it.id !== id);
  writeStoredSessions(next, storage);
  return next;
}
