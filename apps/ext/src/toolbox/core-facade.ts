import { Recorder, Replayer, type FormScript, type ReplayPerformanceResult } from "kazu-fira";
import { exportToPlaywright } from "kazu-fira/adapters";
import { watchOpenShadowRoots } from "../adapters/shadow-dom.js";
import {
  recordedScriptToStoredSession,
  storedSessionToFormScript,
} from "../cli/recording-store.js";
import type { StoredSessionV2 } from "../session-types.js";

type ReplayCallbacks = {
  onStepStart?: (index: number) => void;
  onError?: (message: string) => void;
  onPause?: () => void;
  onResume?: () => void;
  onComplete?: (result: ReplayPerformanceResult) => void;
};

const TOOLBOX_ROOT_ID = "__toolbox-root";
const ALLOW_SENSITIVE_CAPTURE_KEY = "kazu-fira:record:allow-sensitive";

function createIgnoreSelector(): string[] {
  return [`#${TOOLBOX_ROOT_ID}`];
}

export function createToolboxCoreFacade() {
  let recorder: Recorder | null = null;
  let activeReplayer: Replayer | null = null;

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

      const recorded = recorder.stop();
      recorder = null;

      const script: FormScript = {
        version: 2,
        id: recorded.id ?? `script-${Date.now()}`,
        name: name ?? recorded.name ?? "Recording",
        createdAt: recorded.createdAt,
        updatedAt: recorded.updatedAt ?? Date.now(),
        origin: recorded.origin ?? location.origin,
        steps: recorded.steps ?? [],
      };

      return recordedScriptToStoredSession(script);
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
      const expectedOrigin = session.browser?.url ? parseOrigin(session.browser.url) : null;
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
      activeReplayer = replayer;
      replayer.on("pause", () => callbacks.onPause?.());
      replayer.on("resume", () => callbacks.onResume?.());

      try {
        const result = await replayer.play();
        callbacks.onComplete?.(result);
      } finally {
        activeReplayer = null;
      }
    },

    pauseReplay() {
      void activeReplayer?.pause();
    },

    resumeReplay() {
      activeReplayer?.resume();
    },

    async stepReplay() {
      if (!activeReplayer) return;
      await activeReplayer.stepForward();
    },

    stopReplay() {
      activeReplayer?.stop();
      activeReplayer = null;
    },

    isReplaying() {
      return activeReplayer !== null;
    },

    exportSessionToPlaywright(session: StoredSessionV2): string {
      const script = storedSessionToFormScript(session);
      return exportToPlaywright(script);
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
