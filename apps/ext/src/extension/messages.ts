export const PORT_CONNECTION_NAME = "kazu-fira";

export const PORT_MESSAGES = {
  connected: "kazu-fira.connected",
  injected: "kazu-fira.injected",
  mountError: "kazu-fira.mount-error",
  toggleOff: "kazu-fira.toggle-off",
  unmounted: "kazu-fira.unmounted",
} as const;

export type PortMessageType = (typeof PORT_MESSAGES)[keyof typeof PORT_MESSAGES];

export type PortMessage =
  | { type: typeof PORT_MESSAGES.connected }
  | { type: typeof PORT_MESSAGES.injected }
  | { type: typeof PORT_MESSAGES.mountError; message: string }
  | { type: typeof PORT_MESSAGES.toggleOff }
  | { type: typeof PORT_MESSAGES.unmounted };
