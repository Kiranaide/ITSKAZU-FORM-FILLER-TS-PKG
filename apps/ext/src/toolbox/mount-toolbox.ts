import {
  deleteStoredSession,
  readStoredSessions,
  saveStoredSession,
  updateStoredSession,
} from "../cli/recording-store.js";
import type { StoredSessionV2 } from "../session-types.js";
import { createToolboxCoreFacade } from "./core-facade.js";

const MOUNT_ATTR = "data-toolbox-mounted";
const ROOT_ID = "__toolbox-root";
const COLLAPSE_KEY = "kazu-fira:toolbox:collapsed:v1";

type ToolboxState = {
  collapsed: boolean;
  currentSessionId: string;
  renamingId: string;
  runningSessionId: string;
  currentStepIndex: number;
  lastRunLabel: string;
  errorCount: number;
  draftSession: StoredSessionV2 | null;
};

type ToolboxElements = {
  app: HTMLElement;
  state: HTMLElement;
  count: HTMLElement;
  errors: HTMLElement;
  active: HTMLElement;
  logs: HTMLElement;
  record: HTMLButtonElement;
  stop: HTMLButtonElement;
  run: HTMLButtonElement;
  scan: HTMLButtonElement;
  save: HTMLButtonElement;
  newSession: HTMLButtonElement;
  collapse: HTMLButtonElement;
  sessionsGrid: HTMLElement;
  sessionsPane: HTMLElement;
  detailPane: HTMLElement;
  sessionsCount: HTMLElement;
  lastRun: HTMLElement;
  stepCounter: HTMLElement;
  activeInfo: HTMLElement;
  activeTitle: HTMLElement;
  runningBadge: HTMLElement;
  progressBar: HTMLElement;
};

function icon(body: string, fill = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="icon-tabler" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="${fill ? "currentColor" : "none"}" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path>${body}</svg>`;
}

const ICONS = {
  chevronDown: icon(`<path d="M6 9l6 6l6 -6"></path>`),
  chevronRight: icon(`<path d="M9 6l6 6l-6 6"></path>`),
  record: icon(`<circle cx="12" cy="12" r="3"></circle>`, true),
  stop: icon(
    `<path d="M5 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z"></path>`,
  ),
  play: icon(`<path d="M7 4v16l13 -8z"></path>`),
  scan: icon(
    `<path d="M4 7v-1a2 2 0 0 1 2 -2h2"></path><path d="M4 17v1a2 2 0 0 0 2 2h2"></path><path d="M16 4h2a2 2 0 0 1 2 2v1"></path><path d="M16 20h2a2 2 0 0 0 2 -2v-1"></path><path d="M5 12h14"></path>`,
  ),
  save: icon(
    `<path d="M6 4h9l5 5v11a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-15a1 1 0 0 1 1 -1"></path><path d="M14 4v4h-6v-4"></path><path d="M8 18h8"></path><path d="M8 14h8v7h-8z"></path>`,
  ),
  edit: icon(
    `<path d="M7 20h10"></path><path d="M6 16l0 4l4 0l10 -10a2.828 2.828 0 0 0 -4 -4l-10 10"></path>`,
  ),
  close: icon(`<path d="M18 6l-12 12"></path><path d="M6 6l12 12"></path>`),
  check: icon(`<path d="M5 12l5 5l10 -10"></path>`),
};

const TOOLBOX_HTML = `<style>
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0}
.app{position:fixed;bottom:16px;right:16px;z-index:2147483647;width:min(480px,94vw);font:12px ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f1419;color:#e2e8f0;border:0.5px solid #334155;border-radius:14px;box-shadow:0 12px 40px rgba(2,6,23,.6);overflow:hidden}
.app.collapsed{width:min(260px,92vw)}
.header{background:#111827;border-bottom:0.5px solid #334155;padding:10px 14px;display:flex;align-items:center;justify-content:space-between}
.header-title{font-size:14px;font-weight:600}
.header-right{display:flex;align-items:center;gap:8px}
.collapse-btn{padding:4px 8px;min-width:26px;font-size:12px;line-height:1}
.status-pill{font-size:11px;padding:3px 10px;border-radius:20px;font-weight:500}
.status-idle{background:#1e293b;color:#94a3b8;border:0.5px solid #334155}
.status-running{background:rgba(59,130,246,0.15);color:#60a5fa;border:0.5px solid rgba(59,130,246,0.3)}
.status-recording{background:rgba(239,68,68,0.15);color:#f87171;border:0.5px solid rgba(239,68,68,0.3)}
.toolbar{display:flex;gap:6px;padding:10px 14px;background:#111827;border-bottom:0.5px solid #334155;align-items:center}
.toolbar button{display:inline-flex;align-items:center;justify-content:center;gap:6px;line-height:1}
.btn-ico{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;flex:0 0 14px}
.btn-label{line-height:1}
.btn-ico svg,.collapse-btn svg,.icon-btn svg,.log-icon svg{width:14px;height:14px;display:block}
.app.collapsed .btn-label,.app.collapsed .stats-bar,.app.collapsed .body,.app.collapsed .session-label{display:none}
.app.collapsed .toolbar{gap:4px}
.app.collapsed button{padding:5px 8px;min-width:28px}
button{font-family:inherit;cursor:pointer;font-size:12px;border-radius:8px;border:0.5px solid #475569;background:transparent;color:#e2e8f0;padding:5px 12px;transition:background .12s}
button:hover{background:#1e293b}
button:disabled{opacity:.5;cursor:not-allowed}
button.primary{background:rgba(59,130,246,0.15);color:#60a5fa;border-color:rgba(59,130,246,0.3)}
button.primary:hover{background:rgba(59,130,246,0.25)}
button.danger-soft{color:#f87171;border-color:rgba(239,68,68,0.3)}
button.danger-soft:hover{background:rgba(239,68,68,0.15)}
button.icon-btn{padding:4px 8px;min-width:26px;font-size:11px}
.stats-bar{display:flex;gap:0;border-bottom:0.5px solid #334155;background:#0d1117}
.stat{flex:1;padding:8px 14px;font-size:11px;color:#94a3b8;border-right:0.5px solid #334155}
.stat:last-child{border-right:none}
.stat strong{display:block;font-size:16px;font-weight:600;color:#e2e8f0;line-height:1.3}
.stat.danger strong{color:#f87171}
.body{display:flex;height:320px}
.sessions-pane{width:55%;border-right:0.5px solid #334155;display:flex;flex-direction:column}
.pane-header{padding:8px 12px;font-size:11px;font-weight:500;color:#94a3b8;border-bottom:0.5px solid #334155;display:flex;align-items:center;justify-content:space-between;background:#111827;text-transform:uppercase;letter-spacing:.04em}
.sessions-grid{padding:8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1}
.session-card{background:#111827;border:0.5px solid #334155;border-radius:8px;padding:8px 10px;cursor:pointer;transition:border-color .12s}
.session-card:hover{border-color:#475569}
.session-card.active{border-color:rgba(59,130,246,0.5);background:rgba(59,130,246,0.08)}
.session-card.active .session-meta{color:#60a5fa}
.session-top{display:flex;align-items:center;gap:6px}
.session-name{font-size:12px;font-weight:500;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.session-name-input{font-size:12px;font-weight:500;flex:1;border:none;background:transparent;color:#e2e8f0;font-family:inherit;outline:none;border-bottom:1px solid #60a5fa;padding:0}
.session-actions{display:flex;gap:3px;opacity:0;transition:opacity .12s}
.session-card:hover .session-actions,.session-card.active .session-actions{opacity:1}
.session-meta{font-size:10px;color:#64748b;margin-top:5px;display:flex;gap:8px;align-items:center}
.badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:500}
.badge-blue{background:rgba(59,130,246,0.15);color:#60a5fa}
.badge-gray{background:#1e293b;color:#94a3b8;border:0.5px solid #334155}
.detail-pane{flex:1;display:flex;flex-direction:column}
.active-session-info{padding:10px 12px;border-bottom:0.5px solid #334155;background:#111827}
.progress-bar-wrap{background:#1e293b;border-radius:20px;height:4px;margin-top:6px;overflow:hidden}
.progress-bar-fill{height:4px;border-radius:20px;background:#3b82f6;width:0%;transition:width .3s}
.log-area{flex:1;overflow-y:auto;padding:8px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;display:flex;flex-direction:column;gap:3px;white-space:pre-wrap}
.log-line{padding:4px 8px;border-radius:6px;display:flex;align-items:flex-start;gap:8px;line-height:1.4}
.log-line.done{background:rgba(34,197,94,0.1);color:#4ade80}
.log-line.pending{background:#1e293b;color:#94a3b8}
.log-line.running{background:rgba(59,130,246,0.15);color:#60a5fa}
.log-line.error{background:rgba(239,68,68,0.1);color:#f87171}
.log-icon{font-size:11px;margin-top:1px;flex-shrink:0}
.empty-state{color:#64748b;font-size:12px;text-align:center;padding:24px 14px;font-family:inherit}
.toolbar-spacer{flex:1}
.session-label{font-size:11px;color:#64748b}
.toolbar-session-label{font-size:11px;color:#64748b;padding:8px 12px;border-bottom:0.5px solid #334155;background:#111827;text-transform:uppercase;letter-spacing:.04em}
</style>
<div class="app" data-kazu-toolbox="true">
  <div class="header">
    <span class="header-title">Form Filler</span>
    <div class="header-right">
      <button class="collapse-btn" id="toolbox-collapse-toggle" title="Collapse">${ICONS.chevronDown}</button>
      <span class="status-pill status-idle" id="toolbox-state">Idle</span>
    </div>
  </div>
  <div class="toolbar">
    <button class="primary" id="toolbox-record" title="Record"><span class="btn-ico">${ICONS.record}</span><span class="btn-label">Record</span></button>
    <button id="toolbox-stop" disabled title="Stop"><span class="btn-ico">${ICONS.stop}</span><span class="btn-label">Stop</span></button>
    <button id="toolbox-run" title="Run"><span class="btn-ico">${ICONS.play}</span><span class="btn-label">Run</span></button>
    <button id="toolbox-scan" title="Scan"><span class="btn-ico">${ICONS.scan}</span><span class="btn-label">Scan</span></button>
    <button id="toolbox-save" title="Save"><span class="btn-ico">${ICONS.save}</span><span class="btn-label">Save</span></button>
    <div class="toolbar-spacer"></div>
  </div>
  <div class="toolbar-session-label">
    <span class="session-label" id="toolbox-active">No active session</span>
  </div>
  <div class="stats-bar">
    <div class="stat"><strong id="toolbox-count">0</strong>Fields Mapped</div>
    <div class="stat"><strong id="toolbox-sessions-count">0</strong>Saved Sessions</div>
    <div class="stat danger"><strong id="toolbox-errors">0</strong>Errors</div>
    <div class="stat"><strong id="toolbox-last-run">Never</strong>Last Run</div>
  </div>
  <div class="body">
    <div class="sessions-pane" id="toolbox-sessions-pane">
      <div class="pane-header">
        <span>Saved sessions</span>
        <button class="icon-btn" id="toolbox-new-session">+ New</button>
      </div>
      <div class="sessions-grid" id="toolbox-sessions-grid"></div>
    </div>
    <div class="detail-pane" id="toolbox-detail-pane">
      <div class="pane-header">
        <span>Session detail</span>
        <span id="toolbox-step-counter" style="font-weight:400;text-transform:none;letter-spacing:0"></span>
      </div>
      <div class="active-session-info" id="toolbox-active-info" style="display:none">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:12px;font-weight:500" id="toolbox-active-title">-</span>
          <span class="badge badge-blue" id="toolbox-running-badge" style="display:none">running</span>
        </div>
        <div class="progress-bar-wrap"><div class="progress-bar-fill" id="toolbox-progress-bar"></div></div>
      </div>
      <div class="log-area" id="toolbox-logs">
        <div class="empty-state">Select a session to see its steps</div>
      </div>
    </div>
  </div>
</div>`;

function requireElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const node = root.querySelector(selector);
  if (!(node instanceof HTMLElement)) {
    throw new Error(`Toolbox node not found: ${selector}`);
  }
  return node as T;
}

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  } catch {}
}

function formatRelativeDate(dateValue?: number | string): string {
  if (!dateValue) return "Never";
  const date = typeof dateValue === "number" ? new Date(dateValue) : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Never";
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  if (diffDays === 1) return "Yesterday";
  return `${diffDays} days ago`;
}

function sessionLabel(session: StoredSessionV2): string {
  return session.name || "Untitled session";
}

function scanFieldCount(): number {
  return Array.from(
    document.querySelectorAll(
      "input,select,textarea,[contenteditable='true'],[contenteditable='']",
    ),
  ).filter((node) => node instanceof HTMLElement && !node.closest(`#${ROOT_ID}`)).length;
}

export function mountToolbox(storage: Storage = localStorage): void {
  if (document.documentElement.getAttribute(MOUNT_ATTR) === "true") {
    return;
  }
  document.documentElement.setAttribute(MOUNT_ATTR, "true");

  const host = document.createElement("div");
  host.id = ROOT_ID;
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = TOOLBOX_HTML;

  const elements: ToolboxElements = {
    app: requireElement(shadow, ".app"),
    state: requireElement(shadow, "#toolbox-state"),
    count: requireElement(shadow, "#toolbox-count"),
    errors: requireElement(shadow, "#toolbox-errors"),
    active: requireElement(shadow, "#toolbox-active"),
    logs: requireElement(shadow, "#toolbox-logs"),
    record: requireElement(shadow, "#toolbox-record"),
    stop: requireElement(shadow, "#toolbox-stop"),
    run: requireElement(shadow, "#toolbox-run"),
    scan: requireElement(shadow, "#toolbox-scan"),
    save: requireElement(shadow, "#toolbox-save"),
    newSession: requireElement(shadow, "#toolbox-new-session"),
    collapse: requireElement(shadow, "#toolbox-collapse-toggle"),
    sessionsGrid: requireElement(shadow, "#toolbox-sessions-grid"),
    sessionsPane: requireElement(shadow, "#toolbox-sessions-pane"),
    detailPane: requireElement(shadow, "#toolbox-detail-pane"),
    sessionsCount: requireElement(shadow, "#toolbox-sessions-count"),
    lastRun: requireElement(shadow, "#toolbox-last-run"),
    stepCounter: requireElement(shadow, "#toolbox-step-counter"),
    activeInfo: requireElement(shadow, "#toolbox-active-info"),
    activeTitle: requireElement(shadow, "#toolbox-active-title"),
    runningBadge: requireElement(shadow, "#toolbox-running-badge"),
    progressBar: requireElement(shadow, "#toolbox-progress-bar"),
  };

  const core = createToolboxCoreFacade();
  const state: ToolboxState = {
    collapsed: readCollapsed(),
    currentSessionId: "",
    renamingId: "",
    runningSessionId: "",
    currentStepIndex: -1,
    lastRunLabel: "Never",
    errorCount: 0,
    draftSession: null,
  };
  const runtimeLogs: string[] = [];
  let observer: MutationObserver | null = null;
  let scanTimer = 0;

  const getSessions = (): StoredSessionV2[] => readStoredSessions(storage);

  const writeLog = (message: string): void => {
    runtimeLogs.push(message);
    elements.logs.textContent = runtimeLogs.slice(-12).join("\n");
  };

  const setStatus = (status: "idle" | "recording" | "running"): void => {
    if (status === "recording") {
      elements.state.textContent = "Recording";
      elements.state.className = "status-pill status-recording";
      return;
    }
    if (status === "running") {
      elements.state.textContent = "Running";
      elements.state.className = "status-pill status-running";
      return;
    }
    elements.state.textContent = "Idle";
    elements.state.className = "status-pill status-idle";
  };

  const updateButtons = (): void => {
    const hasDraft = Boolean(state.draftSession);
    const hasSelectedSession = Boolean(
      state.currentSessionId &&
        getSessions().some((session) => session.id === state.currentSessionId),
    );
    elements.record.disabled = core.isRecording() || Boolean(state.runningSessionId);
    elements.stop.disabled = !core.isRecording() && !state.runningSessionId;
    elements.run.disabled = core.isRecording();
    elements.scan.disabled = core.isRecording();
    elements.save.disabled = core.isRecording() || !hasDraft;
    elements.newSession.disabled = core.isRecording() || Boolean(state.runningSessionId);
    if (!hasSelectedSession && !hasDraft) {
      elements.active.textContent = "No active session";
    }
  };

  const applyCollapsedUi = (): void => {
    elements.app.classList.toggle("collapsed", state.collapsed);
    elements.collapse.innerHTML = state.collapsed ? ICONS.chevronRight : ICONS.chevronDown;
    elements.collapse.title = state.collapsed ? "Expand" : "Collapse";
  };

  const refreshScan = (): void => {
    elements.count.textContent = String(scanFieldCount());
    elements.errors.textContent = String(state.errorCount);
    elements.lastRun.textContent = state.lastRunLabel;
  };

  const renderDetail = (): void => {
    const activeSession =
      state.draftSession && state.currentSessionId === "__draft__"
        ? state.draftSession
        : (getSessions().find((session) => session.id === state.currentSessionId) ?? null);

    if (!activeSession) {
      elements.detailPane.style.display = "none";
      elements.sessionsPane.style.width = "100%";
      elements.logs.innerHTML = `<div class="empty-state">Select a session to see its steps</div>`;
      elements.activeInfo.style.display = "none";
      elements.stepCounter.textContent = "";
      updateButtons();
      return;
    }

    elements.detailPane.style.display = "flex";
    elements.sessionsPane.style.width = "55%";
    elements.activeInfo.style.display = "block";
    elements.activeTitle.textContent = sessionLabel(activeSession);
    elements.stepCounter.textContent = `${activeSession.steps.length} steps`;
    elements.runningBadge.style.display =
      state.runningSessionId === activeSession.id ? "inline-flex" : "none";

    const pct =
      state.currentStepIndex >= 0 && activeSession.steps.length > 0
        ? Math.round(((state.currentStepIndex + 1) / activeSession.steps.length) * 100)
        : 0;
    elements.progressBar.style.width = `${pct}%`;
    elements.logs.innerHTML = "";

    if (activeSession.steps.length === 0) {
      elements.logs.innerHTML = `<div class="empty-state">No steps recorded yet</div>`;
      updateButtons();
      return;
    }

    activeSession.steps.forEach((step, index) => {
      const row = document.createElement("div");
      let rowClass = "pending";
      let rowIcon = ICONS.record;
      if (state.runningSessionId === activeSession.id && index < state.currentStepIndex) {
        rowClass = "done";
        rowIcon = ICONS.check;
      } else if (state.runningSessionId === activeSession.id && index === state.currentStepIndex) {
        rowClass = "running";
      }

      const detail =
        step.type === "wait"
          ? `${step.displayName}`
          : step.type === "navigate"
            ? `${step.displayName}`
            : `${step.displayName} -> ${step.selector}`;

      row.className = `log-line ${rowClass}`;
      row.innerHTML = `<span class="log-icon">${rowIcon}</span><span>${detail}</span>`;
      elements.logs.appendChild(row);
    });

    updateButtons();
  };

  const renderSessionsGrid = (): void => {
    const sessions = getSessions();
    elements.sessionsGrid.innerHTML = "";
    elements.sessionsCount.textContent = String(sessions.length);

    if (
      !sessions.some((session) => session.id === state.currentSessionId) &&
      state.currentSessionId !== "__draft__"
    ) {
      state.currentSessionId = "";
    }

    if (state.draftSession) {
      const draftCard = document.createElement("div");
      draftCard.className = `session-card${state.currentSessionId === "__draft__" ? " active" : ""}`;
      draftCard.innerHTML = `
        <div class="session-top">
          <span class="session-name">${sessionLabel(state.draftSession)} (draft)</span>
          <div class="session-actions">
            <button class="icon-btn primary" data-action="save" title="Save">${ICONS.save}</button>
          </div>
        </div>
        <div class="session-meta">
          <span class="badge badge-gray">${state.draftSession.steps.length} steps</span>
          <span>Unsaved recording</span>
        </div>`;
      draftCard.addEventListener("click", () => {
        state.currentSessionId = "__draft__";
        renderSessionsGrid();
      });
      draftCard.querySelector("[data-action='save']")?.addEventListener("click", (event) => {
        event.stopPropagation();
        const suggestedName = state.draftSession?.name ?? `Session ${new Date().toLocaleString()}`;
        const name = window.prompt("Session name", suggestedName) ?? suggestedName;
        if (!state.draftSession) return;
        const saved = {
          ...state.draftSession,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: name.trim() || suggestedName,
        };
        saveStoredSession(saved, storage);
        state.currentSessionId = saved.id;
        state.draftSession = null;
        writeLog(`saved locally: ${saved.name}`);
        renderSessionsGrid();
      });
      elements.sessionsGrid.appendChild(draftCard);
    }

    for (const session of sessions) {
      const card = document.createElement("div");
      const isActive = state.currentSessionId === session.id;
      card.className = `session-card${isActive ? " active" : ""}`;
      card.setAttribute("data-session-id", session.id);

      const isRenaming = state.renamingId === session.id;
      const nameMarkup = isRenaming
        ? `<input class="session-name-input" id="rename-${session.id}" value="${sessionLabel(session)}" />`
        : `<span class="session-name">${sessionLabel(session)}</span>`;

      card.innerHTML = `
        <div class="session-top">
          ${nameMarkup}
          <div class="session-actions">
            <button class="icon-btn" data-action="rename" title="Rename">${ICONS.edit}</button>
            <button class="icon-btn primary" data-action="run" title="Run">${ICONS.play}</button>
            <button class="icon-btn danger-soft" data-action="delete" title="Delete">${ICONS.close}</button>
          </div>
        </div>
        <div class="session-meta">
          <span class="badge badge-blue">${session.steps.length} steps</span>
          <span>Last run: ${formatRelativeDate(session.lastRunAt)}</span>
        </div>`;

      card.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button") || target.closest("input")) return;
        state.currentSessionId = state.currentSessionId === session.id ? "" : session.id;
        renderSessionsGrid();
      });

      card.querySelector("[data-action='rename']")?.addEventListener("click", (event) => {
        event.stopPropagation();
        state.renamingId = session.id;
        renderSessionsGrid();
      });

      card.querySelector("[data-action='run']")?.addEventListener("click", (event) => {
        event.stopPropagation();
        state.currentSessionId = session.id;
        void runSelectedSession(session.id);
      });

      card.querySelector("[data-action='delete']")?.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteStoredSession(session.id, storage);
        if (state.currentSessionId === session.id) {
          state.currentSessionId = "";
        }
        writeLog("deleted session");
        renderSessionsGrid();
      });

      elements.sessionsGrid.appendChild(card);

      if (isRenaming) {
        queueMicrotask(() => {
          const input = shadow.getElementById(`rename-${session.id}`) as HTMLInputElement | null;
          if (!input) return;
          input.focus();
          input.select();
          const commit = () => {
            updateStoredSession(session.id, { name: input.value.trim() || session.name }, storage);
            state.renamingId = "";
            renderSessionsGrid();
          };
          input.addEventListener("blur", commit, { once: true });
          input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              state.renamingId = "";
              renderSessionsGrid();
            }
          });
        });
      }
    }

    const activeSession =
      state.currentSessionId === "__draft__"
        ? state.draftSession
        : sessions.find((session) => session.id === state.currentSessionId);
    elements.active.textContent = activeSession ? sessionLabel(activeSession) : "No active session";
    renderDetail();
    refreshScan();
  };

  const scheduleScan = (): void => {
    if (scanTimer) {
      window.clearTimeout(scanTimer);
    }
    scanTimer = window.setTimeout(refreshScan, 120);
  };

  const runSelectedSession = async (sessionId = state.currentSessionId): Promise<void> => {
    const session = getSessions().find((item) => item.id === sessionId);
    if (!session) {
      writeLog("no recording to run");
      return;
    }

    state.runningSessionId = session.id;
    state.currentSessionId = session.id;
    state.currentStepIndex = -1;
    setStatus("running");
    updateButtons();
    renderDetail();

    await core.replaySession(session, {
      onStepStart: (index) => {
        state.currentStepIndex = index;
        renderDetail();
      },
      onError: (message) => {
        state.errorCount += 1;
        writeLog(message);
        refreshScan();
      },
      onComplete: () => {
        state.runningSessionId = "";
        state.currentStepIndex = -1;
        state.lastRunLabel = "Just now";
        setStatus("idle");
        updateStoredSession(session.id, (s) => ({ ...s, lastRunAt: Date.now() }), storage);
        renderSessionsGrid();
        writeLog(`run complete (${session.steps.length} steps)`);
      },
    });
  };

  const stopCurrentAction = (): void => {
    if (core.isRecording()) {
      const suggestedName = `Session ${new Date().toLocaleString()}`;
      state.draftSession = core.stopRecording(suggestedName);
      state.currentSessionId = state.draftSession ? "__draft__" : "";
      setStatus("idle");
      writeLog(
        state.draftSession
          ? `recording stopped (${state.draftSession.steps.length} steps)`
          : "recording stopped",
      );
      renderSessionsGrid();
      return;
    }

    state.runningSessionId = "";
    state.currentStepIndex = -1;
    setStatus("idle");
    renderSessionsGrid();
    writeLog("run stopped");
  };

  const startRecording = (): void => {
    state.draftSession = null;
    state.currentSessionId = "";
    core.startRecording();
    setStatus("recording");
    updateButtons();
    writeLog("recording started");
  };

  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });

  elements.record.addEventListener("click", startRecording);
  elements.stop.addEventListener("click", stopCurrentAction);
  elements.run.addEventListener("click", () => {
    if (state.currentSessionId === "__draft__" && state.draftSession) {
      saveStoredSession(
        {
          ...state.draftSession,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
        storage,
      );
      state.draftSession = null;
      renderSessionsGrid();
      return;
    }
    void runSelectedSession();
  });
  elements.scan.addEventListener("click", refreshScan);
  elements.save.addEventListener("click", () => {
    if (!state.draftSession) {
      writeLog("nothing to save");
      return;
    }
    const suggestedName = state.draftSession.name || `Session ${new Date().toLocaleString()}`;
    const name = window.prompt("Session name", suggestedName) ?? suggestedName;
    const saved = {
      ...state.draftSession,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || suggestedName,
    };
    saveStoredSession(saved, storage);
    state.currentSessionId = saved.id;
    state.draftSession = null;
    writeLog(`saved locally: ${saved.name}`);
    renderSessionsGrid();
  });
  elements.newSession.addEventListener("click", () => {
    const session: StoredSessionV2 = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: "New session",
      origin: location.origin,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      browser: {
        url: location.href,
        userAgent: navigator.userAgent,
      },
      steps: [],
    };
    saveStoredSession(session, storage);
    state.currentSessionId = session.id;
    state.renamingId = session.id;
    renderSessionsGrid();
  });
  elements.collapse.addEventListener("click", () => {
    state.collapsed = !state.collapsed;
    writeCollapsed(state.collapsed);
    applyCollapsedUi();
  });

  window.addEventListener("popstate", scheduleScan);
  window.addEventListener("hashchange", scheduleScan);

  applyCollapsedUi();
  renderSessionsGrid();
  refreshScan();
}
