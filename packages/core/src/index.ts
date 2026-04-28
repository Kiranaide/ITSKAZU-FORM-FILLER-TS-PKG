import type { KazuFiraHooks, KazuFiraPlugin } from "./core/types";

export { migrateScript } from "./core/migrations";
export { Recorder } from "./core/recorder";
export { Replayer } from "./core/replayer";
export type { FormScript, FormScriptStep, SelectorStrategy } from "./core/schema";
export { normalizeScriptInput } from "./core/script-normalizer";
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

export function applyPlugins(
  plugins: readonly KazuFiraPlugin[] = [],
  hooks: KazuFiraHooks = {},
): KazuFiraHooks {
  for (const plugin of plugins) {
    plugin.install(hooks);
  }

  return hooks;
}
