import type { KazuFiraHooks, KazuFiraPlugin } from "./core/types";
import { mountToolbar } from "./overlay/toolbar";

export { watchOpenShadowRoots } from "./adapters/shadow-dom";
export { watchNavigation } from "./adapters/spa-router";
export { Recorder } from "./core/recorder";
export { Replayer } from "./core/replayer";
export { deserializeScript, serializeScript } from "./core/serializer";
export {
  deleteScript,
  exportScript,
  loadAllScripts,
  saveScript,
} from "./core/storage";
export type {
  KazuFiraHooks,
  KazuFiraPlugin,
  RecordedAction,
  RecordedScript,
  RecorderOptions,
  ReplayOptions,
} from "./core/types";
export { mountToolbar } from "./overlay/toolbar";

export interface KazuFiraInitOptions {
  toolbar?: boolean;
  plugins?: KazuFiraPlugin[];
  hooks?: KazuFiraHooks;
}

export function init(options: KazuFiraInitOptions = {}): void {
  const runtimeHooks = options.hooks ?? {};
  for (const plugin of options.plugins ?? []) {
    plugin.install(runtimeHooks);
  }

  if (options?.toolbar !== false) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountToolbar);
    } else {
      mountToolbar();
    }
  }
}
