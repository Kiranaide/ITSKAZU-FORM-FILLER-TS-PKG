import type { RecordedScript } from "./types";

export function serializeScript(script: RecordedScript, pretty = true): string {
  return JSON.stringify(script, null, pretty ? 2 : 0);
}

export function deserializeScript(raw: string): RecordedScript {
  const parsed = JSON.parse(raw) as Partial<RecordedScript>;

  if (parsed.version !== "1") {
    throw new Error("Unsupported script version");
  }

  if (!Array.isArray(parsed.actions)) {
    throw new Error("Invalid script: actions must be an array");
  }

  return {
    version: "1",
    name: parsed.name ?? "Imported recording",
    url: parsed.url ?? "",
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    userAgent: parsed.userAgent ?? "",
    actions: parsed.actions,
  };
}
