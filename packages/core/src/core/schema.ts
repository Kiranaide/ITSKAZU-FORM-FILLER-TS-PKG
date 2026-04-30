export const FORMSCRIPT_VERSION = 2 as const;

export type SelectorStrategy =
  | { kind: "id"; value: string }
  | { kind: "name"; value: string }
  | { kind: "data"; attr: string; value: string }
  | { kind: "aria"; value: string }
  | { kind: "css"; value: string };

export type ControlType =
  | "text"
  | "currency"
  | "native-select"
  | "react-select"
  | "datepicker"
  | "button"
  | "unknown";

export type CommitReason =
  | "input"
  | "change"
  | "blur"
  | "tab"
  | "enter"
  | "option-select"
  | "calendar-day"
  | "click"
  | "keyboard"
  | "unknown";

export type SelectorSource = "testid" | "role" | "label" | "placeholder" | "name" | "id" | "css";

export type SelectorConfidence = "high" | "medium" | "low";

export interface StepMetadata {
  controlType?: ControlType;
  commitReason?: CommitReason;
  normalizedValue?: string;
  optionId?: string;
  optionLabel?: string;
  selectorSource?: SelectorSource;
  selectorConfidence?: SelectorConfidence;
}

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
      timestamp: number;
      metadata?: StepMetadata;
    }
  | {
      type: "click";
      selector: SelectorStrategy;
      timestamp: number;
      metadata?: StepMetadata;
    }
  | {
      type: "keyboard";
      selector: SelectorStrategy;
      key: string;
      timestamp: number;
      metadata?: StepMetadata;
    }
  | {
      type: "select";
      selector: SelectorStrategy;
      value: string;
      timestamp: number;
      metadata?: StepMetadata;
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
