import { SESSION_STORAGE_KEY_V2 } from "../cli/recording-store.js";

const COLLAPSE_KEY = "kazu-fira:toolbox:collapsed:v1";
const SESSION_KEYS = [SESSION_STORAGE_KEY_V2, COLLAPSE_KEY] as const;

function hasChromeStorage(): boolean {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}

export function getExtensionStorage(): Storage {
  return localStorage;
}

export async function preloadExtensionStorage(): Promise<void> {
  if (!hasChromeStorage()) return;
  const snapshot = await chrome.storage.local.get([...SESSION_KEYS]);
  for (const key of SESSION_KEYS) {
    const value = snapshot[key];
    if (typeof value === "string") {
      localStorage.setItem(key, value);
    }
  }
}

export async function flushExtensionStorage(storage: Storage): Promise<void> {
  if (!hasChromeStorage()) return;
  const payload: Record<string, string> = {};
  for (const key of SESSION_KEYS) {
    const value = storage.getItem(key);
    if (typeof value === "string") {
      payload[key] = value;
    }
  }
  if (Object.keys(payload).length > 0) {
    await chrome.storage.local.set(payload);
  }
}

let storageListener: ((changes: Record<string, chrome.storage.StorageChange>) => void) | null =
  null;

export function startStorageSync(): void {
  if (!hasChromeStorage()) return;
  if (storageListener) return;

  storageListener = (changes: Record<string, chrome.storage.StorageChange>) => {
    for (const key of SESSION_KEYS) {
      const change = changes[key];
      if (!change) continue;
      const newValue = change.newValue;
      if (typeof newValue === "string") {
        localStorage.setItem(key, newValue);
      }
    }
  };

  chrome.storage.onChanged.addListener(storageListener);
}

export function stopStorageSync(): void {
  if (!hasChromeStorage() || !storageListener) return;
  chrome.storage.onChanged.removeListener(storageListener);
  storageListener = null;
}
