import { describe, expect, it } from "vitest";
import { readStoredSessions, SESSION_STORAGE_KEY_V2, writeStoredSessions } from "./recording-store";

function createStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key) {
      return data.get(key) ?? null;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    removeItem(key) {
      data.delete(key);
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

describe("recording-store", () => {
  it("reads only v2 sessions and ignores legacy keys", () => {
    const storage = createStorage({
      "kazu-fira:latest-recording": JSON.stringify([{ type: "click", selector: "#legacy" }]),
      "kazu-fira:scripts": JSON.stringify([{ version: 1, name: "legacy-script" }]),
      [SESSION_STORAGE_KEY_V2]: JSON.stringify([
        {
          id: "v2-session",
          schemaVersion: "2",
          name: "Newest",
          createdAt: new Date("2026-01-01").toISOString(),
          url: "https://example.test",
          userAgent: "test-agent",
          steps: [],
        },
      ]),
    });

    const sessions = readStoredSessions(storage);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe("v2-session");
  });

  it("writes bounded v2 session payloads", () => {
    const storage = createStorage();
    writeStoredSessions(
      [
        {
          id: "a",
          schemaVersion: "2",
          name: "A",
          createdAt: new Date("2026-01-01").toISOString(),
          url: "https://a.test",
          userAgent: "agent",
          steps: [],
        },
        {
          id: "b",
          schemaVersion: "2",
          name: "B",
          createdAt: new Date("2026-01-02").toISOString(),
          url: "https://b.test",
          userAgent: "agent",
          steps: [],
        },
      ],
      storage,
      1,
    );

    const raw = storage.getItem(SESSION_STORAGE_KEY_V2);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? "[]") as Array<{ id: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.id).toBe("b");
  });
});
