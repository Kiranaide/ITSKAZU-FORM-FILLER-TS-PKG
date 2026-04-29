import { type FormScript, normalizeScriptInput } from "kazu-fira";

const STORAGE_KEY = "kazu-fira:scripts";

export function saveScript(
  script: FormScript,
  storage: Storage = localStorage,
): void {
  const existing = loadAllScripts(storage);
  existing.push(normalizeScriptInput(script));
  storage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function loadAllScripts(storage: Storage = localStorage): FormScript[] {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]") as unknown[];
    return parsed.map((item) => normalizeScriptInput(item as FormScript));
  } catch {
    return [];
  }
}

export function deleteScript(name: string, storage: Storage = localStorage): void {
  const scripts = loadAllScripts(storage).filter((s) => s.name !== name);
  storage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

export function exportScript(script: FormScript): void {
  const normalized = normalizeScriptInput(script);
  const blob = new Blob([JSON.stringify(normalized, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `${normalized.name.replace(/\s+/g, "-")}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
}