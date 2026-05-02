import { PORT_CONNECTION_NAME, PORT_MESSAGES } from "./messages.js";

const AUTO_INJECT_ORIGINS_KEY = "kazu-fira:auto-inject-origins:v1";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const contentPorts = new Map<number, chrome.runtime.Port>();

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function injectIntoTab(tabId: number, retries = MAX_RETRIES): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content-entry.js"],
      });
      return;
    } catch (error) {
      if (attempt < retries) {
        console.warn(
          `[kazu-fira-ext] inject attempt ${attempt}/${retries} failed, retrying in ${RETRY_DELAY_MS}ms`,
          error,
        );
        await sleep(RETRY_DELAY_MS);
      } else {
        console.error(`[kazu-fira-ext] inject failed after ${retries} attempts`, error);
        throw error;
      }
    }
  }
}

async function sendToggleOff(port: chrome.runtime.Port): Promise<void> {
  port.postMessage({ type: PORT_MESSAGES.toggleOff });
}

function cleanupPort(tabId: number): void {
  const port = contentPorts.get(tabId);
  if (port) {
    try {
      port.disconnect();
    } catch {}
    contentPorts.delete(tabId);
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PORT_CONNECTION_NAME) return;
  if (typeof port.sender?.tab?.id !== "number") return;

  const tabId = port.sender.tab.id;
  contentPorts.set(tabId, port);

  port.onDisconnect.addListener(() => {
    contentPorts.delete(tabId);
  });

  port.onMessage.addListener((msg) => {
    if (msg.type === PORT_MESSAGES.unmounted) {
      contentPorts.delete(tabId);
    }
  });
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!isInjectableTab(tab)) return;
  const origin = toOrigin(tab.url);
  if (!origin) return;

  const existingPort = contentPorts.get(tab.id);

  if (existingPort) {
    await toggleAutoInjectForOrigin(origin);
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
    await sendToggleOff(existingPort);
    return;
  }

  const enabled = await toggleAutoInjectForOrigin(origin);

  console.info("[kazu-fira-ext] action.clicked", {
    tabId: tab.id,
    url: tab.url,
    enabled,
  });

  await chrome.action.setBadgeText({ tabId: tab.id, text: enabled ? "ON" : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#2563eb" });

  if (!enabled) return;

  try {
    await injectIntoTab(tab.id);
  } catch (error) {
    console.error("[kazu-fira-ext] inject failed", error);
  }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;
  if (!isInjectableTab(tab)) return;
  const origin = toOrigin(tab.url);
  if (!origin) return;
  if (!(await isAutoInjectEnabled(origin))) return;

  if (contentPorts.has(tabId)) {
    return;
  }

  try {
    await injectIntoTab(tabId);
    await chrome.action.setBadgeText({ tabId, text: "ON" });
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
  } catch (error) {
    console.error("[kazu-fira-ext] auto-inject failed", error);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupPort(tabId);
});
