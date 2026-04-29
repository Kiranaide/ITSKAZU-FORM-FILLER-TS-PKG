import type { FormScript, FormScriptStep } from "./schema";

export const CURRENT_VERSION = 2 as const;

export function validateScript(raw: unknown): FormScript {
  const script = toRecord(raw);

  if (script["version"] !== CURRENT_VERSION) {
    const versionInfo = script["version"] ? `version ${String(script["version"])}` : "no version";
    throw new Error(
      `Unsupported script ${versionInfo}. ` +
        `kazu-fira only supports version ${CURRENT_VERSION} scripts. ` +
        `Please re-record your script.`,
    );
  }

  return validateFormScript(script);
}

function validateFormScript(script: Record<string, unknown>): FormScript {
  const now = Date.now();
  return {
    version: CURRENT_VERSION,
    id: String(script["id"] ?? `script-${now}`),
    name: String(script["name"] ?? "Untitled recording"),
    createdAt: typeof script["createdAt"] === "number" ? script["createdAt"] : now,
    updatedAt: typeof script["updatedAt"] === "number" ? script["updatedAt"] : now,
    origin: typeof script["origin"] === "string" ? script["origin"] : "",
    steps: normalizeSteps(script["steps"]),
  };
}

function normalizeSteps(steps: unknown): FormScript["steps"] {
  if (!Array.isArray(steps)) return [];

  return steps.filter((step: unknown): step is FormScriptStep => {
    if (!step || typeof step !== "object") return false;
    const validTypes = ["input", "click", "select", "keyboard", "navigate", "wait", "assert"];
    const type = (step as { type?: unknown }).type;
    return typeof type === "string" && validTypes.includes(type);
  });
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as Record<string, unknown>;
}

export function createEmptyScript(name?: string): FormScript {
  const now = Date.now();
  return {
    version: CURRENT_VERSION,
    id: `script-${now}`,
    name: name ?? "Untitled recording",
    createdAt: now,
    updatedAt: now,
    origin: "",
    steps: [],
  };
}
