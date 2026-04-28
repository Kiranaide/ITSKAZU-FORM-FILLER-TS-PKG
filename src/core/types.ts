export type ActionType =
  | "input"
  | "change"
  | "focus"
  | "blur"
  | "click"
  | "submit"
  | "select"
  | "checkbox"
  | "radio"
  | "file";

export interface ElementSelector {
  strategies: SelectorStrategy[];
  label?: string;
  fieldType?: string;
}

export interface SelectorStrategy {
  type: "id" | "name" | "aria-label" | "data-testid" | "css" | "xpath";
  value: string;
  confidence: number;
}

export interface RecordedAction {
  id: string;
  type: ActionType;
  selector: ElementSelector;
  value?: string | boolean | string[];
  timestamp: number;
  delay: number;
  metadata?: {
    url: string;
    viewport: { w: number; h: number };
    formId?: string;
    fieldLabel?: string;
  };
}

export interface RecordedScript {
  version: "1";
  name: string;
  url: string;
  createdAt: string;
  userAgent: string;
  actions: RecordedAction[];
}

export interface RecorderOptions {
  root?: HTMLElement | ShadowRoot;
  mask?: string[];
  ignore?: string[];
  captureDelay?: boolean;
  onAction?: (action: RecordedAction) => void;
}

export interface ReplayOptions {
  script: RecordedScript;
  speedMultiplier?: number;
  onBeforeAction?: (action: RecordedAction) => boolean | Promise<boolean>;
  onAfterAction?: (action: RecordedAction, el: Element | null) => void;
  onError?: (action: RecordedAction, error: Error) => "skip" | "abort";
  highlight?: boolean;
}

export type SessionStepType = "fill" | "check" | "click" | "keyboard";

export interface SessionStep {
  type: SessionStepType;
  selector: string;
  selectors: string[];
  displayName: string;
  tagName: string;
  inputType?: string;
  value?: string;
  checked?: boolean;
  ts: number;
}

export interface StoredSessionV2 {
  id: string;
  schemaVersion: "2";
  name: string;
  createdAt: string;
  url: string;
  userAgent: string;
  steps: SessionStep[];
}
