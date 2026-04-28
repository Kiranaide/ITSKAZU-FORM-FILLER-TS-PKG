export interface LogEntry {
  id: string;
  level: "info" | "success" | "warn" | "error";
  category: "record" | "replay" | "system" | "ws";
  message: string;
  detail?: string;
  stepId?: string;
  selector?: string;
  ts: number;
}

export function mountLogPanel(root: ShadowRoot, onClear: () => void): { add(entry: LogEntry): void } {
  const host = document.createElement("div");
  host.className = "log-panel";
  host.innerHTML = `<div class="log-head"><strong>Logs</strong><button data-clear>Clear</button></div><div data-list></div>`;
  root.append(host);
  const list = host.querySelector("[data-list]") as HTMLElement;
  host.querySelector<HTMLButtonElement>("[data-clear]")?.addEventListener("click", onClear);
  return {
    add(entry) {
      const row = document.createElement("div");
      row.textContent = `[${new Date(entry.ts).toLocaleTimeString()}] [${entry.category}] ${entry.message}`;
      list.append(row);
    },
  };
}
