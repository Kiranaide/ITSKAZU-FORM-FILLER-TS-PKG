import { EXTENSION_EVENTS, type ExtensionMessage } from "./messages.js";

const AUTO_INJECT_ORIGINS_KEY = "kazu-fira:auto-inject-origins:v1";

function isInjectableTab(
  tab: chrome.tabs.Tab,
): tab is chrome.tabs.Tab & { id: number; url: string } {
  if (typeof tab.id !== "number" || typeof tab.url !== "string") return false;
  return /^https?:\/\//.test(tab.url);
}

function toOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

async function readAutoInjectOrigins(): Promise<Record<string, true>> {
  const data = await chrome.storage.local.get(AUTO_INJECT_ORIGINS_KEY);
  const candidate = data[AUTO_INJECT_ORIGINS_KEY];
  if (!candidate || typeof candidate !== "object") return {};
  const result: Record<string, true> = {};
  for (const [key, value] of Object.entries(candidate as Record<string, unknown>)) {
    if (value === true) {
      result[key] = true;
    }
  }
  return result;
}

async function writeAutoInjectOrigins(next: Record<string, true>): Promise<void> {
  await chrome.storage.local.set({ [AUTO_INJECT_ORIGINS_KEY]: next });
}

async function toggleAutoInjectForOrigin(origin: string): Promise<boolean> {
  const map = await readAutoInjectOrigins();
  if (map[origin]) {
    delete map[origin];
    await writeAutoInjectOrigins(map);
    return false;
  }
  map[origin] = true;
  await writeAutoInjectOrigins(map);
  return true;
}

async function isAutoInjectEnabled(origin: string): Promise<boolean> {
  const map = await readAutoInjectOrigins();
  return map[origin] === true;
}

async function injectIntoTab(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const scriptId = "__kazu-fira-content-entry-script";
      const existing = document.getElementById(scriptId);
      if (existing) {
        existing.remove();
      }

      const script = document.createElement("script");
      script.id = scriptId;
      script.type = "module";
      script.src = chrome.runtime.getURL("content-entry.js");
      script.onerror = () => {
        script.remove();
      };
      (document.head ?? document.documentElement).appendChild(script);
    },
  });
}

function logEvent(message: ExtensionMessage): void {
  const prefix = "[kazu-fira-ext]";
  if (message.type === EXTENSION_EVENTS.mountError) {
    console.error(prefix, message.type, {
      tabId: message.tabId,
      url: message.url,
      error: message.message,
    });
    return;
  }
  console.info(prefix, message.type, {
    tabId: message.tabId,
    url: message.url,
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!isInjectableTab(tab)) return;
  const origin = toOrigin(tab.url);
  if (!origin) return;

  const enabled = await toggleAutoInjectForOrigin(origin);

  const injectRequested: ExtensionMessage = {
    type: EXTENSION_EVENTS.injectRequested,
    tabId: tab.id,
    url: tab.url,
  };
  logEvent(injectRequested);
  await chrome.action.setBadgeText({ tabId: tab.id, text: enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#2563eb" });

  if (!enabled) {
    return;
  }

  try {
    await injectIntoTab(tab.id);
  } catch (error) {
    const failure: ExtensionMessage = {
      type: EXTENSION_EVENTS.mountError,
      tabId: tab.id,
      url: tab.url,
      message: error instanceof Error ? error.message : String(error),
    };
    logEvent(failure);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!isInjectableTab(tab)) return;
  const origin = toOrigin(tab.url);
  if (!origin) return;
  if (!(await isAutoInjectEnabled(origin))) return;

  try {
    await injectIntoTab(tabId);
    await chrome.action.setBadgeText({ tabId, text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
  } catch (error) {
    const failure: ExtensionMessage = {
      type: EXTENSION_EVENTS.mountError,
      tabId,
      url: tab.url,
      message: error instanceof Error ? error.message : String(error),
    };
    logEvent(failure);
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!sender.tab || typeof sender.tab.id !== "number") return;
  if (!sender.tab.url || typeof message !== "object" || message === null) return;
  const candidate = message as Partial<ExtensionMessage>;
  if (typeof candidate.type !== "string") return;

  if (
    candidate.type === EXTENSION_EVENTS.injected ||
    candidate.type === EXTENSION_EVENTS.alreadyMounted ||
    candidate.type === EXTENSION_EVENTS.mountError
  ) {
    const eventMessage: ExtensionMessage =
      candidate.type === EXTENSION_EVENTS.mountError
        ? {
            type: candidate.type,
            tabId: sender.tab.id,
            url: sender.tab.url,
            message:
              typeof candidate.message === "string"
                ? candidate.message
                : "Unknown content script error",
          }
        : { type: candidate.type, tabId: sender.tab.id, url: sender.tab.url };
    logEvent(eventMessage);
  }
});
