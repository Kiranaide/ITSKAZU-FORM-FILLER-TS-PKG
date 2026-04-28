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
  assertion?: string | undefined;
  expected?: string | number | undefined;
  ts: number;
}

export interface StoredSessionV2 {
  id: string;
  name: string;
  origin: string;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  steps: SessionStep[];
  viewState?: {
    scrollX: number;
    scrollY: number;
    viewport: { w: number; h: number };
  } | undefined;
  browser: {
    url: string;
    userAgent: string;
  };
  metadata?: {
    title?: string;
    description?: string;
    duration?: number;
  } | undefined;
}