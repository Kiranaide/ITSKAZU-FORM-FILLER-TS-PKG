import type { LogEntry } from "../overlay/log-panel.js";

export class LogStore {
  private entries: LogEntry[] = [];
  constructor(private readonly limit = 500) {}
  add(entry: LogEntry): void {
    this.entries.push(entry);
    while (this.entries.length > this.limit) this.entries.shift();
  }
  all(): LogEntry[] {
    return [...this.entries];
  }
  clear(): void {
    this.entries = [];
  }
}
