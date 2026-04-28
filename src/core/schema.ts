export const FORMSCRIPT_VERSION = 2 as const;

export type SelectorStrategy =
  | { kind: "id"; value: string }
  | { kind: "name"; value: string }
  | { kind: "data"; attr: string; value: string }
  | { kind: "aria"; value: string }
  | { kind: "css"; value: string };

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
      type: "select";
      selector: SelectorStrategy;
      value: string;
      timestamp: number;
    }
  | {
      type: "navigate";
      url: string;
      timestamp: number;
    }
  | {
      type: "wait";
      ms: number;
    };

export interface FormScript {
  version: typeof FORMSCRIPT_VERSION;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  origin: string;
  steps: FormScriptStep[];
}
