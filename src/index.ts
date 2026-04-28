import { mountToolbar } from "./overlay/toolbar";

export { Recorder } from "./core/recorder";
export { Replayer } from "./core/replayer";
export { serializeScript, deserializeScript } from "./core/serializer";
export { mountToolbar } from "./overlay/toolbar";
export { watchNavigation } from "./adapters/spa-router";
export { watchOpenShadowRoots } from "./adapters/shadow-dom";
export {
  saveScript,
  loadAllScripts,
  exportScript,
  deleteScript,
} from "./core/storage";
export type {
  RecordedScript,
  RecordedAction,
  RecorderOptions,
  ReplayOptions,
} from "./core/types";

export function init(options?: { toolbar?: boolean }): void {
  if (options?.toolbar !== false) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountToolbar);
    } else {
      mountToolbar();
    }
  }
}
