import type { KazuFiraHooks, KazuFiraPlugin } from "./core/types";
import type { RecordedAction, RecordedScript } from "./core/types";

export { createEmptyScript, migrateScript } from "./core/migrations";
export type { PIIDetectionField, PIIMaskingConfig } from "./core/pii-detector";
export { createDefaultPIIConfig, PIIDetector } from "./core/pii-detector";
export { Recorder, type RecorderState } from "./core/recorder";
export type { ReplayerState } from "./core/replayer";
export { normalizeScriptInput, Replayer } from "./core/replayer";
export type {
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
export type { ExportOptions } from "./exporters";
export { exportToPlaywright, exportToPuppeteer } from "./exporters";

export type { RecorderOptions, ReplayOptions, KazuFiraHooks, KazuFiraPlugin, RecordedAction, RecordedScript } from "./core/types";

export function applyPlugins(
  plugins: readonly KazuFiraPlugin[] = [],
  hooks: KazuFiraHooks = {},
): KazuFiraHooks {
  for (const plugin of plugins) {
    plugin.install(hooks);
  }

  return hooks;
}