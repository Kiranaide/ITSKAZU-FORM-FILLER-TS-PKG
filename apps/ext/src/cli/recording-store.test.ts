import { describe, expect, it } from "vitest";
import { readStoredSessions, SESSION_STORAGE_KEY_V2, writeStoredSessions } from "./recording-store";

const createStorage = (): Storage => {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      Object.keys(store).forEach((key) => delete store[key]);
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
};

describe("recording-store", () => {
  it("reads empty array when no sessions stored", () => {
    const storage = createStorage();
    const sessions = readStoredSessions(storage);
    expect(sessions).toHaveLength(0);
  });

  it("writes bounded v2 session payloads", () => {
    const storage = createStorage();
    writeStoredSessions(
      [
        {
          id: "a",
          name: "A",
          origin: "http://a.com",
          createdAt: 1,
          updatedAt: 1,
          browser: { url: "http://a.com", userAgent: "agent" },
          steps: [],
        },
        {
          id: "b",
          name: "B",
          origin: "http://b.com",
          createdAt: 2,
          updatedAt: 2,
          browser: { url: "http://b.com", userAgent: "agent" },
          steps: [],
        },
      ],
      storage,
    );

    const raw = storage.getItem(SESSION_STORAGE_KEY_V2);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw ?? "[]") as Array<{ id: string }>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.id).toBe("a");
    expect(parsed[1]?.id).toBe("b");
  });
});
