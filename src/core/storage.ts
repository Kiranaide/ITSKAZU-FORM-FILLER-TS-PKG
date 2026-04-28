import { migrateScript } from "./migrations";
import type { FormScript } from "./schema";
import type { RecordedScript } from "./types";

const STORAGE_KEY = "kazu-fira:scripts";

export function saveScript(script: FormScript | RecordedScript): void {
  const existing = loadAllScripts();
  existing.push(migrateScript(script));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function loadAllScripts(): FormScript[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown[];
    return parsed.map((item) => migrateScript(item));
  } catch {
    return [];
  }
}

export function deleteScript(name: string): void {
  const scripts = loadAllScripts().filter((s) => s.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

export function exportScript(script: FormScript | RecordedScript): void {
  const normalized = migrateScript(script);
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
