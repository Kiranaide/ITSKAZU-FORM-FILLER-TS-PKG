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
  label?: string;
  fieldType?: string;
  source?: "testid" | "role" | "label" | "placeholder" | "name" | "id" | "css";
  confidence?: "high" | "medium" | "low";
}

export interface SelectorStrategy {
  type: "id" | "name" | "aria-label" | "data-testid" | "css" | "xpath";
  value: string;
  confidence: number;
  source?: "testid" | "role" | "label" | "placeholder" | "name" | "id" | "css";
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
        formId?: string;
        fieldLabel?: string;
      }
    | undefined;
}

export interface RecordedScript {
  version: 2;
  name: string;
  id?: string;
  createdAt: number;
  updatedAt?: number;
  origin?: string;
  steps?: FormScriptStep[];
  actions?: RecordedAction[];
}

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
  script: FormScript;
  expectedOrigin?: string;
  allowCrossOriginReplay?: boolean;
  speedMultiplier?: number;
  slowThreshold?: number;
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
