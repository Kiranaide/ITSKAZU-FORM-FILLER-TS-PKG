import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXTENSION_EVENTS } from "./messages";

describe("content-entry bootstrap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-toolbox-mounted");
    delete window.__kazuFiraToolboxMounted;
    vi.unstubAllGlobals();
  });

  it("does not mount twice when already initialized", async () => {
    globalThis.__KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__ = true;
    window.__kazuFiraToolboxMounted = true;
    const sendMessage = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        sendMessage,
      },
      storage: {
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
      },
    });

    const mod = await import("./content-entry");
    await mod.bootstrapContentScript();

    expect(sendMessage).toHaveBeenCalledWith({
      type: EXTENSION_EVENTS.alreadyMounted,
    });
  });
});
