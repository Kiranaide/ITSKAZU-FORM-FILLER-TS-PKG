import type { RecordedScript } from "./types";

const STORAGE_KEY = "itskazu-form-filler:scripts";

export function saveScript(script: RecordedScript): void {
  const existing = loadAllScripts();
  existing.push(script);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function loadAllScripts(): RecordedScript[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function deleteScript(name: string): void {
  const scripts = loadAllScripts().filter((s) => s.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

export function exportScript(script: RecordedScript): void {
  const blob = new Blob([JSON.stringify(script, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: `${script.name.replace(/\s+/g, "-")}.json`,
  });
  a.click();
  URL.revokeObjectURL(url);
}
