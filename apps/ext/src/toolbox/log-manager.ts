import type { LogEntry } from "../cli/log-store.js";

export type LogLevel = LogEntry["level"];

export class LogManager {
  private entries: LogEntry[] = [];
  private max = 200;
  onUpdate?: () => void;

  log(level: LogLevel, category: string, message: string): void {
    this.entries.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      level,
      category,
      message,
      ts: Date.now(),
    });
    if (this.entries.length > this.max) {
      this.entries.splice(0, this.entries.length - this.max);
    }
    this.onUpdate?.();
  }

  info(category: string, message: string): void {
    this.log("info", category, message);
  }

  warn(category: string, message: string): void {
    this.log("warn", category, message);
  }

  error(category: string, message: string): void {
    this.log("error", category, message);
  }

  success(category: string, message: string): void {
    this.log("info", category, message);
  }

  clear(): void {
    this.entries = [];
    this.onUpdate?.();
  }

  getAll(): LogEntry[] {
    return [...this.entries];
  }

  getFiltered(level: LogLevel | "all"): LogEntry[] {
    if (level === "all") return this.getAll();
    return this.entries.filter((e) => e.level === level);
  }
}
