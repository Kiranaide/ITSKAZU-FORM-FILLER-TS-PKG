import { migrateScript } from "./migrations";
import type { FormScript } from "./schema";

export function serializeScript(script: FormScript, pretty = true): string {
  return JSON.stringify(script, null, pretty ? 2 : 0);
}

export function deserializeScript(raw: string): FormScript {
  try {
    return migrateScript(JSON.parse(raw) as unknown);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown parse error";
    throw new Error(`Invalid script JSON: ${message}`);
  }
}
