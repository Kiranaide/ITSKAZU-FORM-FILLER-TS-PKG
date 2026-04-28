export type ActionType =
  | "input"
  | "change"
  | "focus"
  | "blur"
  | "click"
  | "keyboard"
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

export interface LegacyRecordedScript {
  version: "1";
  name: string;
  createdAt: string | number;
  url?: string | undefined;
  userAgent?: string | undefined;
  actions?: RecordedAction[] | undefined;
  id?: string | undefined;
}

export interface RecordedScriptV2 {
  version: 2;
  id?: string | undefined;
  name: string;
  createdAt: number;
  updatedAt?: number | undefined;
  origin?: string | undefined;
  steps?: FormScriptStep[] | undefined;
  actions?: RecordedAction[] | undefined;
  url?: string | undefined;
  userAgent?: string | undefined;
}

export type VersionedRecordedScript = LegacyRecordedScript | RecordedScriptV2;

export interface RecorderOptions {
  root?: HTMLElement | ShadowRoot;
  mask?: string[];
  maskSensitiveInputs?: boolean;
  ignore?: string[];
  captureDelay?: boolean;
  onAction?: (action: RecordedAction) => void;
  observeShadowRoots?: ((onShadowRoot: (root: ShadowRoot) => void) => () => void) | undefined;
  hooks?: KazuFiraHooks;
}

export interface ReplayOptions {
  script: FormScript | RecordedScript | VersionedRecordedScript;
  expectedOrigin?: string;
  allowCrossOriginReplay?: boolean;
  speedMultiplier?: number;
  onBeforeAction?: (action: FormScriptStep) => boolean | Promise<boolean>;
  onAfterAction?: (action: FormScriptStep, el: Element | null) => void;
  onError?: (action: FormScriptStep, error: Error) => "skip" | "abort";
  highlight?: boolean;
  highlightElement?: ((el: Element) => void) | undefined;
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

import type { FormScript, FormScriptStep } from "./schema";
