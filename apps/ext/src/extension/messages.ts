export const EXTENSION_EVENTS = {
  injectRequested: "kazu-fira.inject.requested",
  injected: "kazu-fira.injected",
  alreadyMounted: "kazu-fira.inject.already-mounted",
  mountError: "kazu-fira.inject.mount-error",
} as const;

export type ExtensionEvent =
  (typeof EXTENSION_EVENTS)[keyof typeof EXTENSION_EVENTS];

export type ExtensionMessage =
  | {
      type: typeof EXTENSION_EVENTS.injectRequested;
      tabId: number;
      url: string;
    }
  | {
      type: typeof EXTENSION_EVENTS.injected;
      tabId: number;
      url: string;
    }
  | {
      type: typeof EXTENSION_EVENTS.alreadyMounted;
      tabId: number;
      url: string;
    }
  | {
      type: typeof EXTENSION_EVENTS.mountError;
      tabId: number;
      url: string;
      message: string;
    };
