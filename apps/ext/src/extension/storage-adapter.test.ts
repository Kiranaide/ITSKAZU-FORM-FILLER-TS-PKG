import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_STORAGE_KEY_V2 } from "../cli/recording-store";
import {
  flushExtensionStorage,
  getExtensionStorage,
  preloadExtensionStorage,
} from "./storage-adapter";

const COLLAPSE_KEY = "kazu-fira:toolbox:collapsed:v1";

describe("storage-adapter", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("preloads chrome storage keys into localStorage", async () => {
    const get = vi.fn().mockResolvedValue({
      [SESSION_STORAGE_KEY_V2]: '[{"id":"one","schemaVersion":"2"}]',
      [COLLAPSE_KEY]: "1",
    });
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: { local: { get, set } } });

    await preloadExtensionStorage();

    expect(localStorage.getItem(SESSION_STORAGE_KEY_V2)).toContain('"id":"one"');
    expect(localStorage.getItem(COLLAPSE_KEY)).toBe("1");
  });

  it("flushes local storage values back to chrome storage", async () => {
    const get = vi.fn().mockResolvedValue({});
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", { storage: { local: { get, set } } });
    localStorage.setItem(SESSION_STORAGE_KEY_V2, '[{"id":"sync","schemaVersion":"2"}]');
    localStorage.setItem(COLLAPSE_KEY, "0");

    await flushExtensionStorage(getExtensionStorage());

    expect(set).toHaveBeenCalledWith({
      [SESSION_STORAGE_KEY_V2]: '[{"id":"sync","schemaVersion":"2"}]',
      [COLLAPSE_KEY]: "0",
    });
  });
});
