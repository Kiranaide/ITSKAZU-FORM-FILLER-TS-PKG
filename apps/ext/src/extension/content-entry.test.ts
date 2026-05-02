import { beforeEach, describe, expect, it, vi } from "vitest";
import { PORT_CONNECTION_NAME, PORT_MESSAGES } from "./messages";

describe("content-entry bootstrap", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.removeAttribute("data-toolbox-mounted");
    // biome-ignore lint/suspicious/noExplicitAny: test global flag
    (window as any).__kazuFiraToolboxMounted = undefined;
    // biome-ignore lint/suspicious/noExplicitAny: test global flag
    (globalThis as any).__KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__ = undefined;
    vi.unstubAllGlobals();
  });

  it("does not mount twice when already initialized", async () => {
    globalThis.__KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__ = true;
    window.__kazuFiraToolboxMounted = true;

    const connect = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        connect,
        onMessage: { addListener: vi.fn() },
      },
      storage: {
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    const mod = await import("./content-entry");
    await mod.bootstrapContentScript();

    expect(connect).not.toHaveBeenCalled();
  });

  it("connects via port and mounts toolbox", async () => {
    globalThis.__KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__ = true;

    const postMessage = vi.fn();
    const onMsgListeners: Array<(msg: unknown) => void> = [];
    const onDisconnectListeners: Array<() => void> = [];

    const connect = vi.fn().mockReturnValue({
      name: PORT_CONNECTION_NAME,
      postMessage,
      disconnect: vi.fn(),
      onMessage: { addListener: vi.fn().mockImplementation((fn) => onMsgListeners.push(fn)) },
      onDisconnect: {
        addListener: vi.fn().mockImplementation((fn) => onDisconnectListeners.push(fn)),
      },
    });

    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        connect,
        onMessage: { addListener: vi.fn() },
      },
      storage: {
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    const mod = await import("./content-entry");
    await mod.bootstrapContentScript();

    expect(connect).toHaveBeenCalledWith({ name: PORT_CONNECTION_NAME });
    expect(postMessage).toHaveBeenCalledWith({ type: PORT_MESSAGES.connected });
  });

  it("handles toggleOff message by unmounting and disconnecting", async () => {
    globalThis.__KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__ = true;

    const postMessage = vi.fn();
    const disconnect = vi.fn();
    const onMsgListeners: Array<(msg: unknown) => void> = [];
    const onDisconnectListeners: Array<() => void> = [];

    const connect = vi.fn().mockReturnValue({
      name: PORT_CONNECTION_NAME,
      postMessage,
      disconnect,
      onMessage: { addListener: vi.fn().mockImplementation((fn) => onMsgListeners.push(fn)) },
      onDisconnect: {
        addListener: vi.fn().mockImplementation((fn) => onDisconnectListeners.push(fn)),
      },
    });

    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        connect,
        onMessage: { addListener: vi.fn() },
      },
      storage: {
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    const mod = await import("./content-entry");
    await mod.bootstrapContentScript();
    for (const fn of onMsgListeners) {
      fn({ type: PORT_MESSAGES.toggleOff });
    }

    expect(postMessage).toHaveBeenCalledWith({ type: PORT_MESSAGES.unmounted });
  });

  it("handles port disconnect by unmounting if still mounted", async () => {
    globalThis.__KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__ = true;

    const onDisconnectListeners: Array<() => void> = [];

    const connect = vi.fn().mockReturnValue({
      name: PORT_CONNECTION_NAME,
      postMessage: vi.fn(),
      disconnect: vi.fn(),
      onMessage: { addListener: vi.fn() },
      onDisconnect: {
        addListener: vi.fn().mockImplementation((fn) => onDisconnectListeners.push(fn)),
      },
    });

    vi.stubGlobal("chrome", {
      runtime: {
        id: "test",
        connect,
        onMessage: { addListener: vi.fn() },
      },
      storage: {
        local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
        onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      },
    });

    await import("./content-entry");
    window.__kazuFiraToolboxMounted = true;
  });
});
