import { validateScript } from "./migrations";
import type { FormScript } from "./schema";
import type { ReplayOptions } from "./types";

export function normalizeScriptInput(raw: ReplayOptions["script"]): FormScript {
  return validateScript(raw);
}
