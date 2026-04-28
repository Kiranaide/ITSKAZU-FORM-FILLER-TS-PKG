import { migrateScript } from "./migrations";
import type { FormScript } from "./schema";

export function serializeScript(script: FormScript, pretty = true): string {
  return JSON.stringify(script, null, pretty ? 2 : 0);
}

export function deserializeScript(raw: string): FormScript {
  return migrateScript(JSON.parse(raw) as unknown);
}
