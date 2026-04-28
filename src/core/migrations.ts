import type { FormScript } from "./schema";

type LegacyV1Script = {
  id?: string;
  name?: string;
  steps?: unknown[];
  createdAt?: number;
  origin?: string;
  version?: number;
  [key: string]: unknown;
};

export function migrateScript(raw: unknown): FormScript {
  const now = Date.now();
  const script = (raw ?? {}) as LegacyV1Script;

  if (script.version !== 2) {
    return {
      version: 2,
      id: String(script.id ?? `script-${now}`),
      name: String(script.name ?? "Imported recording"),
      createdAt: typeof script.createdAt === "number" ? script.createdAt : now,
      updatedAt: now,
      origin: typeof script.origin === "string" ? script.origin : "",
      steps: Array.isArray(script.steps) ? (script.steps as FormScript["steps"]) : [],
    };
  }

  return script as unknown as FormScript;
}
