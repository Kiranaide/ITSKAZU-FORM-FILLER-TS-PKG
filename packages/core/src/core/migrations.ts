import type { FormScript } from "./schema";
import type { RecordedScriptV2 } from "./types";

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

  const v2 = script as RecordedScriptV2;
  return {
    version: 2,
    id: String(v2.id ?? `script-${now}`),
    name: String(v2.name ?? "Imported recording"),
    createdAt: typeof v2.createdAt === "number" ? v2.createdAt : now,
    updatedAt: typeof v2.updatedAt === "number" ? v2.updatedAt : now,
    origin: typeof v2.origin === "string" ? v2.origin : "",
    steps: Array.isArray(v2.steps) ? v2.steps : [],
  };
}
