import type { KazuFiraHooks, KazuFiraPlugin, RecordedAction, RecordedScript } from "./core/types";

export { createEmptyScript, validateScript } from "./core/migrations";
export type { PIIDetectionField, PIIMaskingConfig } from "./core/pii-detector";
export { createDefaultPIIConfig, PIIDetector } from "./core/pii-detector";
export { Recorder, type RecorderState } from "./core/recorder";
export type { ReplayerState } from "./core/replayer";
export { AssertionError, createAssertStep, normalizeScriptInput, Replayer } from "./core/replayer";
export type {
  AssertionProperty,
  FormScript,
  FormScriptStep,
  ReplayPerformanceResult,
  SelectorStrategy,
  StepTiming,
} from "./core/schema";
export {
  extractSelectors,
  resolveByFormSelectorStrategy,
  toFormSelectorStrategy,
} from "./core/selector";
export { deserializeScript, serializeScript } from "./core/serializer";
export type {
  KazuFiraHooks,
  KazuFiraPlugin,
  RecordedAction,
  RecordedScript,
  RecorderOptions,
  ReplayOptions,
} from "./core/types";
export type { ExportOptions } from "./exporters";
export { exportToPlaywright, exportToPuppeteer } from "./exporters";
export { createMaskPlugin } from "./plugins/mask.plugin";

export function applyPlugins(
  plugins: readonly KazuFiraPlugin[] = [],
  hooks: KazuFiraHooks = {},
): KazuFiraHooks {
  for (const plugin of plugins) {
    plugin.install(hooks);
  }

  return hooks;
}
