export const FORMSCRIPT_VERSION = 2 as const;

export type SelectorStrategy =
  | { kind: "id"; value: string }
  | { kind: "name"; value: string }
  | { kind: "data"; attr: string; value: string }
  | { kind: "aria"; value: string }
  | { kind: "css"; value: string };

export type AssertionType =
  | "visible"
  | "hidden"
  | "enabled"
  | "disabled"
  | "checked"
  | "unchecked"
  | "text"
  | "value"
  | "count"
  | "contains";

export type AssertionOperator = "equals" | "contains" | "matches" | "gt" | "gte" | "lt" | "lte";
export type AssertionProperty = "visible" | "value" | "text" | "checked";

export type AssertStep = {
  type: "assert";
  selector?: SelectorStrategy;
  assertion: AssertionType;
  property?: AssertionProperty;
  expected?: string | number;
  operator?: AssertionOperator;
  timestamp: number;
};

export type FormScriptStep =
  | {
      type: "input";
      selector: SelectorStrategy;
      value: string;
      masked: boolean;
      timestamp: number;
    }
  | {
      type: "click";
      selector: SelectorStrategy;
      timestamp: number;
    }
  | {
      type: "keyboard";
      selector: SelectorStrategy;
      key: string;
      timestamp: number;
    }
  | {
      type: "select";
      selector: SelectorStrategy;
      value: string;
      timestamp: number;
    }
  | {
      type: "navigate";
      url: string;
      timestamp: number;
      triggeredBy?: "link" | "form" | "script" | "popstate";
    }
  | {
      type: "wait";
      ms: number;
    }
  | AssertStep;

export interface StepTiming {
  stepIndex: number;
  type: FormScriptStep["type"];
  selector?: SelectorStrategy;
  startTime: number;
  endTime: number;
  durationMs: number;
}

export interface ReplayPerformanceResult {
  scriptId: string;
  scriptName: string;
  totalMs: number;
  totalDurationMs: number;
  timings: StepTiming[];
  stepTimings: StepTiming[];
  slowSteps: StepTiming[];
  startTime: number;
  endTime: number;
  stepsPerSecond: number;
}

export interface FormScript {
  version: typeof FORMSCRIPT_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  origin: string;
  steps: FormScriptStep[];
}
