export type ToolboxMessageType =
  | "recording:save"
  | "recording:saved"
  | "recording:list"
  | "recording:load"
  | "log:entry"
  | "toolbox:ws:connected"
  | "toolbox:ws:disconnected";

export interface ToolboxMessage<T = unknown> {
  type: ToolboxMessageType;
  payload: T;
  ts: number;
}
