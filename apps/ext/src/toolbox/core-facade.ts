import { Recorder, Replayer } from "kazu-fira";
import { watchOpenShadowRoots } from "../adapters/shadow-dom.js";
import {
  recordedScriptToStoredSession,
  storedSessionToFormScript,
} from "../cli/recording-store.js";
import type { StoredSessionV2 } from "../session-types.js";

type ReplayCallbacks = {
  onStepStart?: (index: number) => void;
  onError?: (message: string) => void;
  onComplete?: () => void;
};

const TOOLBOX_ROOT_ID = "__toolbox-root";
const ALLOW_SENSITIVE_CAPTURE_KEY = "kazu-fira:record:allow-sensitive";

function createIgnoreSelector(): string[] {
  return [`#${TOOLBOX_ROOT_ID}`];
}

export function createToolboxCoreFacade() {
  let recorder: Recorder | null = null;

  return {
    startRecording() {
      const allowSensitiveCapture = readAllowSensitiveCapture();
      recorder = new Recorder({
        ignore: createIgnoreSelector(),
        maskSensitiveInputs: !allowSensitiveCapture,
        observeShadowRoots: (onShadowRoot) =>
          watchOpenShadowRoots((shadowRoot) => {
            const host = shadowRoot.host;
            if (host instanceof HTMLElement && host.id === TOOLBOX_ROOT_ID) {
              return;
            }
            onShadowRoot(shadowRoot);
          }),
      });
      recorder.start();
    },

    stopRecording(name?: string): StoredSessionV2 | null {
      if (!recorder) {
        return null;
      }

      const script = recorder.stop();
      recorder = null;
      return recordedScriptToStoredSession(script, name ? { name } : {});
    },

    cancelRecording() {
      if (!recorder) {
        return;
      }
      recorder.stop();
      recorder = null;
    },

    isRecording() {
      return recorder !== null;
    },

    async replaySession(session: StoredSessionV2, callbacks: ReplayCallbacks = {}) {
      const script = storedSessionToFormScript(session);
      const expectedOrigin = parseOrigin(session.url);
      const replayer = new Replayer({
        script,
        ...(expectedOrigin ? { expectedOrigin } : {}),
        onBeforeAction: async (step) => {
          const index = script.steps.indexOf(step);
          callbacks.onStepStart?.(index);
          return true;
        },
        onError: (step, error) => {
          callbacks.onError?.(`${step.type}: ${error.message}`);
          return "skip";
        },
      });

      await replayer.play();
      callbacks.onComplete?.();
    },
  };
}

export type ToolboxCoreFacade = ReturnType<typeof createToolboxCoreFacade>;

function readAllowSensitiveCapture(): boolean {
  try {
    return localStorage.getItem(ALLOW_SENSITIVE_CAPTURE_KEY) === "1";
  } catch {
    return false;
  }
}

function parseOrigin(url: string): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}
