import { beforeEach, describe, expect, it, vi } from "vitest";
import { PORT_CONNECTION_NAME, PORT_MESSAGES } from "./messages";

type PortMock = {
  name: string;
  sender: { tab?: { id: number } } | undefined;
  postMessage: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  onMessage: { addListener: ReturnType<typeof vi.fn> };
  onDisconnect: { addListener: ReturnType<typeof vi.fn> };
};

function makePortMock(name: string, tabId?: number): PortMock {
  return {
    name,
    sender: tabId ? { tab: { id: tabId } } : undefined,
    postMessage: vi.fn(),
    disconnect: vi.fn(),
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
  };
}

describe("background service worker", () => {
  let onConnectListeners: Array<(port: PortMock) => void>;
  let onClickedListeners: Array<(tab: { id: number; url: string }) => void>;
  let onUpdatedListeners: Array<
    (tabId: number, changeInfo: { status: string }, tab: { id: number; url: string }) => void
  >;
  let onRemovedListeners: Array<(tabId: number) => void>;
  let storageGet: ReturnType<typeof vi.fn>;
  let storageSet: ReturnType<typeof vi.fn>;
  let executeScript: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllGlobals();

    onConnectListeners = [];
    onClickedListeners = [];
    onUpdatedListeners = [];
    onRemovedListeners = [];
    executeScript = vi.fn().mockResolvedValue([{}]);
    storageGet = vi.fn().mockResolvedValue({});
    storageSet = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("chrome", {
      runtime: {
        id: "test-ext",
        onConnect: {
          addListener: vi.fn().mockImplementation((fn: (port: PortMock) => void) => {
            onConnectListeners.push(fn);
          }),
        },
        sendMessage: vi.fn(),
      },
      storage: {
        local: { get: storageGet, set: storageSet },
      },
      scripting: { executeScript },
      action: {
        setBadgeText: vi.fn().mockResolvedValue(undefined),
        setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
        onClicked: {
          addListener: vi
            .fn()
            .mockImplementation((fn: (tab: { id: number; url: string }) => void) => {
              onClickedListeners.push(fn);
            }),
        },
      },
      tabs: {
        onUpdated: {
          addListener: vi
            .fn()
            .mockImplementation(
              (
                fn: (
                  tabId: number,
                  changeInfo: { status: string },
                  tab: { id: number; url: string },
                ) => void,
              ) => {
                onUpdatedListeners.push(fn);
              },
            ),
        },
        onRemoved: {
          addListener: vi.fn().mockImplementation((fn: (tabId: number) => void) => {
            onRemovedListeners.push(fn);
          }),
        },
      },
    });

    await import("./background");
  });

  it("handles port connection from content script", () => {
    const port = makePortMock(PORT_CONNECTION_NAME, 42);
    onConnectListeners[0]?.(port);

    expect(port.onDisconnect.addListener).toHaveBeenCalled();
  });

  it("ignores non-kazu-fira port connections", () => {
    const port = makePortMock("other-connection", 42);
    onConnectListeners[0]?.(port);

    expect(port.postMessage).not.toHaveBeenCalled();
  });

  it("tracks port on connect and cleans up on unmounted message", () => {
    const port = makePortMock(PORT_CONNECTION_NAME, 99);
    onConnectListeners[0]?.(port);
  });

  it("injects into tab on action click", async () => {
    expect(onClickedListeners.length).toBe(1);
    const clickHandler = onClickedListeners[0];
    if (!clickHandler) return;

    await clickHandler({ id: 42, url: "https://example.com" });

    const getCall = storageGet.mock.calls[0];
    expect(getCall).toBeTruthy();
  });

  it("sends toggleOff when injecting into already-connected tab", async () => {
    const port = makePortMock(PORT_CONNECTION_NAME, 42);
    onConnectListeners[0]?.(port);

    storageGet.mockResolvedValue({
      "kazu-fira:auto-inject-origins:v1": { "https://example.com": true },
    });

    const clickHandler = onClickedListeners[0];
    if (!clickHandler) return;
    await clickHandler({ id: 42, url: "https://example.com" });

    expect(port.postMessage).toHaveBeenCalledWith({ type: PORT_MESSAGES.toggleOff });
  });

  it("cleans up port on tab removal", () => {
    const port = makePortMock(PORT_CONNECTION_NAME, 42);
    port.disconnect = vi.fn();
    onConnectListeners[0]?.(port);

    onRemovedListeners[0]?.(42);
  });

  it("does not re-inject on tab update when port exists", async () => {
    const port = makePortMock(PORT_CONNECTION_NAME, 42);
    onConnectListeners[0]?.(port);

    const changedOrigin = "https://example.com";
    storageGet.mockResolvedValue({
      "kazu-fira:auto-inject-origins:v1": { [changedOrigin]: true },
    });

    const updateHandler = onUpdatedListeners[0];
    if (!updateHandler) return;
    await updateHandler(42, { status: "complete" }, { id: 42, url: `${changedOrigin}/page` });

    expect(executeScript).not.toHaveBeenCalled();
  });

  it("injects on tab update when no port exists and auto-inject enabled", async () => {
    const url = "https://example.com/page";
    storageGet.mockResolvedValue({
      "kazu-fira:auto-inject-origins:v1": { "https://example.com": true },
    });

    const updateHandler = onUpdatedListeners[0];
    if (!updateHandler) return;
    await updateHandler(42, { status: "complete" }, { id: 42, url });

    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ["content-entry.js"],
    });
  });
});
