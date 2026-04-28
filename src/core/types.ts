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
  label?: string | undefined;
  fieldType?: string | undefined;
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
  value?: string | boolean | string[] | undefined;
  timestamp: number;
  delay: number;
  metadata?:
    | {
        url: string;
        viewport: { w: number; h: number };
        formId?: string | undefined;
        fieldLabel?: string | undefined;
      }
    | undefined;
}

export interface RecordedScript {
  version: "1" | 2;
  name: string;
  url?: string | undefined;
  createdAt: string | number;
  userAgent?: string | undefined;
  actions?: RecordedAction[] | undefined;
  id?: string | undefined;
  updatedAt?: number | undefined;
  origin?: string | undefined;
  steps?: FormScriptStep[] | undefined;
}

export interface RecorderOptions {
  root?: HTMLElement | ShadowRoot;
  mask?: string[];
  ignore?: string[];
  captureDelay?: boolean;
  onAction?: (action: RecordedAction) => void;
  hooks?: KazuFiraHooks;
}

export interface ReplayOptions {
  script: FormScript | RecordedScript;
  speedMultiplier?: number;
  onBeforeAction?: (action: FormScriptStep) => boolean | Promise<boolean>;
  onAfterAction?: (action: FormScriptStep, el: Element | null) => void;
  onError?: (action: FormScriptStep, error: Error) => "skip" | "abort";
  highlight?: boolean;
  hooks?: KazuFiraHooks;
}

export interface KazuFiraHooks {
  onRecordStart?: () => void;
  onRecordStop?: (script: FormScript) => void;
  onStep?: (step: FormScriptStep) => FormScriptStep | null;
  onReplayStart?: (script: FormScript) => void;
  onReplayStep?: (step: FormScriptStep, index: number) => void;
  onReplayEnd?: (script: FormScript, status: "success" | "error") => void;
  onError?: (err: Error, context: "record" | "replay") => void;
}

export interface KazuFiraPlugin {
  name: string;
  install(hooks: KazuFiraHooks): void;
}

export type SessionStepType = "fill" | "check" | "click" | "keyboard";

export interface SessionStep {
  type: SessionStepType;
  selector: string;
  selectors: string[];
  displayName: string;
  tagName: string;
  inputType?: string | undefined;
  value?: string | undefined;
  checked?: boolean | undefined;
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

import type { FormScript, FormScriptStep } from "./schema";
