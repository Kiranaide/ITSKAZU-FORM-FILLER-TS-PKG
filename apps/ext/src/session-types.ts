import type { FormScriptStep } from "kazu-fira";

export type SessionStepType = FormScriptStep["type"];

export interface SessionStep {
  type: SessionStepType;
  scriptStep: FormScriptStep;
  selector: string;
  selectors: string[];
  displayName: string;
  tagName: string;
  inputType?: string | undefined;
  value?: string | undefined;
  checked?: boolean | undefined;
  masked?: boolean | undefined;
  optionText?: string | undefined;
  url?: string | undefined;
  ms?: number | undefined;
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
  lastRunAt?: string | undefined;
  originScriptId?: string | undefined;
}
