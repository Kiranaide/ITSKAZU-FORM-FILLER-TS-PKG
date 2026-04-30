import { mountToolbox } from "../toolbox/mount-toolbox.js";
import { EXTENSION_EVENTS } from "./messages.js";
import {
  flushExtensionStorage,
  getExtensionStorage,
  preloadExtensionStorage,
} from "./storage-adapter.js";

declare global {
  interface Window {
    __kazuFiraToolboxMounted?: boolean;
  }
  // Used by tests to avoid running bootstrap at import time.
  var __KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__: boolean | undefined;
}

function sendRuntimeEvent(type: typeof EXTENSION_EVENTS.injected): void;
function sendRuntimeEvent(type: typeof EXTENSION_EVENTS.alreadyMounted): void;
function sendRuntimeEvent(type: typeof EXTENSION_EVENTS.mountError, message: string): void;
function sendRuntimeEvent(type: string, message?: string): void {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) return;
  const payload =
    type === EXTENSION_EVENTS.mountError
      ? { type, message: message ?? "Unknown mount error" }
      : { type };
  void chrome.runtime.sendMessage(payload);
}

export async function bootstrapContentScript(): Promise<void> {
  await preloadExtensionStorage();
  if (window.__kazuFiraToolboxMounted === true) {
    sendRuntimeEvent(EXTENSION_EVENTS.alreadyMounted);
    return;
  }

  try {
    mountToolbox(getExtensionStorage());
    window.__kazuFiraToolboxMounted = true;
    sendRuntimeEvent(EXTENSION_EVENTS.injected);
    await flushExtensionStorage(getExtensionStorage());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendRuntimeEvent(EXTENSION_EVENTS.mountError, message);
  }
}

if (!globalThis.__KAZU_FIRA_DISABLE_CONTENT_BOOTSTRAP__) {
  void bootstrapContentScript();
}
