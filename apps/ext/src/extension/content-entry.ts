import { mountToolbox, unmountToolbox } from "../toolbox/mount-toolbox.js";
import { PORT_CONNECTION_NAME, PORT_MESSAGES, type PortMessage } from "./messages.js";
import {
  flushExtensionStorage,
  getExtensionStorage,
  preloadExtensionStorage,
  startStorageSync,
  stopStorageSync,
} from "./storage-adapter.js";

declare global {
  interface Window {
    __kazuFiraToolboxMounted?: boolean;
  }
  var __KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__: boolean | undefined;
}

function hasChromeRuntime(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

function setupPort(): chrome.runtime.Port | null {
  if (!hasChromeRuntime()) return null;
  const port = chrome.runtime.connect({ name: PORT_CONNECTION_NAME });
  port.postMessage({ type: PORT_MESSAGES.connected });

  port.onMessage.addListener((msg: PortMessage) => {
    if (msg.type === PORT_MESSAGES.toggleOff) {
      unmountToolbox();
      port.postMessage({ type: PORT_MESSAGES.unmounted });
      port.disconnect();
    }
  });

  port.onDisconnect.addListener(() => {
    if (window.__kazuFiraToolboxMounted) {
      unmountToolbox();
    }
    stopStorageSync();
  });

  return port;
}

function notifyMountResult(port: chrome.runtime.Port | null, type: string, message?: string): void {
  if (!port) return;
  const msg: PortMessage = message
    ? { type: type as typeof PORT_MESSAGES.mountError, message }
    : { type: type as typeof PORT_MESSAGES.injected };
  port.postMessage(msg);
}

export async function bootstrapContentScript(): Promise<void> {
  await preloadExtensionStorage();
  if (window.__kazuFiraToolboxMounted === true) return;

  const port = setupPort();

  try {
    mountToolbox(getExtensionStorage());
    window.__kazuFiraToolboxMounted = true;
    notifyMountResult(port, PORT_MESSAGES.injected);
    startStorageSync();

    port?.onDisconnect.addListener(() => {
      if (window.__kazuFiraToolboxMounted) {
        unmountToolbox();
      }
    });

    await flushExtensionStorage(getExtensionStorage());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notifyMountResult(port, PORT_MESSAGES.mountError, message);
  }
}

if (!globalThis.__KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__) {
  void bootstrapContentScript();
}
