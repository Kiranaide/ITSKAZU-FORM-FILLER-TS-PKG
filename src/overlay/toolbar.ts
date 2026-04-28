import { Recorder } from "../core/recorder";
import { Replayer } from "../core/replayer";
import { exportScript, loadAllScripts, saveScript } from "../core/storage";
import type { RecordedScript } from "../core/types";
import { clearHighlight } from "./indicator";
import { mountLogPanel } from "./log-panel";
import { ensureHighlightStyles, toolbarStyles } from "./styles";

type ToolbarElements = {
  recordButton: HTMLButtonElement;
  stopButton: HTMLButtonElement;
  playButton: HTMLButtonElement;
  exportButton: HTMLButtonElement;
  statusNode: HTMLElement;
};

export function mountToolbar(): void {
  if (document.querySelector("#form-pilot-toolbar")) {
    return;
  }

  ensureHighlightStyles();

  const host = document.createElement("div");
  host.id = "form-pilot-toolbar";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>${toolbarStyles}</style>
    <div class="toolbar">
      <span>form-pilot</span>
      <button id="btn-record">Record</button>
      <button id="btn-stop" disabled>Stop</button>
      <button id="btn-play">Play</button>
      <button id="btn-export">Export</button>
      <span class="status" id="status">idle</span>
    </div>
    <div id="log-panel"></div>
  `;

  wireToolbar(shadow);
}

function wireToolbar(shadowRoot: ShadowRoot): void {
  const elements = getElements(shadowRoot);

  let recorder: Recorder | null = null;
  let latestScript: RecordedScript | null = loadLastScript();
  const logPanel = mountLogPanel(shadowRoot, () => undefined);

  const updateStatus = (status: string): void => {
    elements.statusNode.textContent = status;
    logPanel.add({ id: crypto.randomUUID(), level: "info", category: "system", message: status, ts: Date.now() });
  };

  const syncButtons = (recording: boolean): void => {
    elements.recordButton.disabled = recording;
    elements.stopButton.disabled = !recording;
    const hasScript = Boolean(latestScript);
    elements.playButton.disabled = recording || !hasScript;
    elements.exportButton.disabled = recording || !hasScript;
  };

  syncButtons(false);

  elements.recordButton.addEventListener("click", () => {
    recorder = new Recorder();
    recorder.start();
    updateStatus("recording");
    syncButtons(true);
  });

  elements.stopButton.addEventListener("click", () => {
    if (!recorder) {
      return;
    }

    latestScript = recorder.stop();
    saveScript(latestScript);
    recorder = null;
    updateStatus(`saved (${latestScript.actions.length})`);
    syncButtons(false);
  });

  elements.playButton.addEventListener("click", async () => {
    if (!latestScript) {
      updateStatus("no script");
      return;
    }

    updateStatus("playing");
    syncButtons(true);

    const replayer = new Replayer({
      script: latestScript,
      highlight: true,
      onError: () => "skip",
    });

    await replayer.play();
    clearHighlight();
    updateStatus("done");
    syncButtons(false);
  });

  elements.exportButton.addEventListener("click", () => {
    if (!latestScript) {
      updateStatus("no script");
      return;
    }

    exportScript(latestScript);
    updateStatus("exported");
  });
}

function getElements(shadowRoot: ShadowRoot): ToolbarElements {
  const recordButton = requireNode(shadowRoot, "#btn-record") as HTMLButtonElement;
  const stopButton = requireNode(shadowRoot, "#btn-stop") as HTMLButtonElement;
  const playButton = requireNode(shadowRoot, "#btn-play") as HTMLButtonElement;
  const exportButton = requireNode(shadowRoot, "#btn-export") as HTMLButtonElement;
  const statusNode = requireNode(shadowRoot, "#status");

  return {
    recordButton,
    stopButton,
    playButton,
    exportButton,
    statusNode,
  };
}

function requireNode(root: ParentNode, selector: string): HTMLElement {
  const node = root.querySelector(selector);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Toolbar node not found: ${selector}`);
  }
  return node;
}

function loadLastScript(): RecordedScript | null {
  const scripts = loadAllScripts();
  return scripts.at(-1) ?? null;
}
