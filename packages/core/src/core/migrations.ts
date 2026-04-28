import type { FormScript, FormScriptStep } from "./schema";

export const CURRENT_VERSION = 2 as const;

export function migrateScript(raw: unknown): FormScript {
  const script = (raw ?? {}) as any;

  if (script.version !== CURRENT_VERSION) {
    const versionInfo = script.version ? `version ${script.version}` : "no version";
    throw new Error(
      `Unsupported script ${versionInfo}. ` +
        `kazu-fira 2.0.0 only supports version ${CURRENT_VERSION} scripts. ` +
        `Please re-record your script with kazu-fira >= 2.0.0.`,
    );
  }

  return validateFormScript(script);
}

function validateFormScript(script: any): FormScript {
  const now = Date.now();
  return {
    version: CURRENT_VERSION,
    id: String(script.id ?? `script-${now}`),
    name: String(script.name ?? "Untitled recording"),
    createdAt: typeof script.createdAt === "number" ? script.createdAt : now,
    updatedAt: typeof script.updatedAt === "number" ? script.updatedAt : now,
    origin: typeof script.origin === "string" ? script.origin : "",
    steps: normalizeSteps(script.steps),
  };
}

function normalizeSteps(steps: any): FormScript["steps"] {
  if (!Array.isArray(steps)) return [];

  return steps.filter((step: any): step is FormScriptStep => {
    if (!step || typeof step !== "object") return false;
    const validTypes = ["input", "click", "select", "keyboard", "navigate", "wait", "assert"];
    return validTypes.includes(step.type);
  });
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
