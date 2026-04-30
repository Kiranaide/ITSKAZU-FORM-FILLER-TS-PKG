import { type AssertionProperty, createAssertStep, type ReplayPerformanceResult } from "kazu-fira";
import {
  deleteStoredSession,
  readStoredSessions,
  saveStoredSession,
  updateStoredSession,
} from "../cli/recording-store.js";
import type { StoredSessionV2 } from "../session-types.js";
import { createToolboxCoreFacade } from "./core-facade.js";
import { type LogLevel, LogManager } from "./log-manager.js";

const MOUNT_ATTR = "data-toolbox-mounted";
const ROOT_ID = "__toolbox-root";

type ToolboxState = {
  mode: "simple" | "advanced";
  panelCollapsed: Record<string, boolean>;
  fabOpen: boolean;
  currentSessionId: string;
  renamingId: string;
  runningSessionId: string;
  replayPaused: boolean;
  currentStepIndex: number;
  lastRunLabel: string;
  errorCount: number;
  lastReplay: ReplayPerformanceResult | null;
  logFilter: LogLevel | "all";
  logAutoScroll: boolean;
};

type ToolboxElements = {
  fab: HTMLElement;
  toolboxWrap: HTMLElement;
  modeSimple: HTMLButtonElement;
  modeAdv: HTMLButtonElement;
  stateBadge: HTMLElement;
  stateDot: HTMLElement;
  stateText: HTMLElement;
  count: HTMLElement;
  sessionsCount: HTMLElement;
  sessionsCountLabel: HTMLElement;
  errors: HTMLElement;
  selName: HTMLElement;
  selRun: HTMLButtonElement;
  selBar: HTMLElement;
  stepList: HTMLElement;
  progressFill: HTMLElement;
  progressLabel: HTMLElement;
  progressCounter: HTMLElement;
  record: HTMLButtonElement;
  stop: HTMLButtonElement;
  run: HTMLButtonElement;
  pause: HTMLButtonElement;
  step: HTMLButtonElement;
  exportBtn: HTMLButtonElement;
  assertBtn: HTMLButtonElement;
  scan: HTMLButtonElement;
  save: HTMLButtonElement;
  newSession: HTMLButtonElement;
  sessionsGrid: HTMLElement;
  chevSessions: HTMLElement;
  chevProgress: HTMLElement;
  chevSteps: HTMLElement;
  chevLog: HTMLElement;
  bodySessions: HTMLElement;
  bodyProgress: HTMLElement;
  bodySteps: HTMLElement;
  bodyLog: HTMLElement;
  advCol: HTMLElement;
  assertModal: HTMLElement;
  assertSelector: HTMLInputElement;
  assertProperty: HTMLSelectElement;
  assertExpected: HTMLInputElement;
  assertHint: HTMLElement;
  assertError: HTMLElement;
  assertCancel: HTMLButtonElement;
  assertApply: HTMLButtonElement;
  systemLogEntries: HTMLElement;
};

function icon(body: string, fill = false, size = 12): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" class="icon-tabler" width="${size}" height="${size}" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="${fill ? "currentColor" : "none"}" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path>${body}</svg>`;
}

const ICONS = {
  chevronDown: icon(`<path d="M6 9l6 6l6 -6"></path>`),
  chevronRight: icon(`<path d="M9 6l6 6l-6 6"></path>`),
  record: icon(`<circle cx="12" cy="12" r="3"></circle>`, true),
  stop: icon(
    `<path d="M5 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z"></path>`,
  ),
  play: icon(`<path d="M7 4v16l13 -8z"></path>`),
  pause: icon(`<path d="M8 5v14"></path><path d="M16 5v14"></path>`),
  step: icon(`<path d="M6 5v14"></path><path d="M10 7l8 5l-8 5z"></path>`),
  scan: icon(
    `<path d="M4 7v-1a2 2 0 0 1 2 -2h2"></path><path d="M4 17v1a2 2 0 0 0 2 2h2"></path><path d="M16 4h2a2 2 0 0 1 2 2v1"></path><path d="M16 20h2a2 2 0 0 0 2 -2v-1"></path><path d="M5 12h14"></path>`,
  ),
  save: icon(
    `<path d="M6 4h9l5 5v11a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-15a1 1 0 0 1 1 -1"></path><path d="M14 4v4h-6v-4"></path><path d="M8 18h8"></path><path d="M8 14h8v7h-8z"></path>`,
  ),
  export: icon(
    `<path d="M12 3v12"></path><path d="M8 11l4 4l4 -4"></path><path d="M5 21h14"></path>`,
  ),
  assert: icon(`<path d="M9 9a3 3 0 1 1 6 0c0 2 -3 3 -3 5"></path><path d="M12 18h.01"></path>`),
  edit: icon(
    `<path d="M7 20h10"></path><path d="M6 16l0 4l4 0l10 -10a2.828 2.828 0 0 0 -4 -4l-10 10"></path>`,
  ),
  close: icon(`<path d="M18 6l-12 12"></path><path d="M6 6l12 12"></path>`),
  check: icon(`<path d="M5 12l5 5l10 -10"></path>`),
};

const TOOLBOX_HTML = `<style>
:host{all:initial}
:host{--pink:#e91e8c;--pink-dim:rgba(233,30,140,0.12);--pink-glow:rgba(233,30,140,0.25);--surface:#0d0d0f;--surface-1:#141417;--surface-2:#1c1c21;--surface-3:#242429;--border:rgba(255,255,255,0.07);--border-hover:rgba(255,255,255,0.13);--border-accent:rgba(233,30,140,0.35);--text-1:#f0f0f2;--text-2:#8a8a95;--text-3:#4a4a55;--success:#1db37a;--success-dim:rgba(29,179,122,0.12);--warn:#f0a500;--warn-dim:rgba(240,165,0,0.12);--danger:#e8433a;--danger-dim:rgba(232,67,58,0.12);--info:#3d8ef0;--info-dim:rgba(61,142,240,0.12);--font-ui:"Geist",ui-sans-serif,system-ui,sans-serif;--font-mono:"Fira Code",ui-monospace,monospace;--radius:10px;--radius-sm:6px;--radius-pill:999px;--transition:0.18s cubic-bezier(0.4,0,0.2,1)}
*{box-sizing:border-box;margin:0;padding:0}
.fab{position:fixed;bottom:28px;right:28px;width:44px;height:44px;border-radius:50%;background:var(--pink);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:100;box-shadow:0 0 0 0 var(--pink-glow);transition:box-shadow var(--transition),transform var(--transition),background var(--transition)}
.fab:hover{background:#c4176e;transform:scale(1.08);box-shadow:0 0 20px var(--pink-glow)}
.fab:active{transform:scale(0.95)}
.fab svg{transition:transform 0.22s cubic-bezier(0.34,1.56,0.64,1),opacity 0.15s;position:absolute}
.fab .icon-open{opacity:1;transform:rotate(0deg) scale(1)}
.fab .icon-close{opacity:0;transform:rotate(-90deg) scale(0.5)}
.fab.active .icon-open{opacity:0;transform:rotate(90deg) scale(0.5)}
.fab.active .icon-close{opacity:1;transform:rotate(0deg) scale(1)}
.fab.recording::after{content:"";position:absolute;inset:-4px;border-radius:50%;border:1.5px solid var(--pink);animation:pulse-ring 1.4s ease-out infinite}
@keyframes pulse-ring{0%{opacity:0.7;transform:scale(1)}100%{opacity:0;transform:scale(1.6)}}
.toolbox-wrap{position:fixed;bottom:84px;right:28px;width:300px;z-index:99;display:flex;flex-direction:column;gap:6px;transform-origin:bottom right;transition:opacity 0.18s ease,transform 0.2s cubic-bezier(0.34,1.3,0.64,1)}
.toolbox-wrap.hidden{opacity:0;pointer-events:none;transform:scale(0.85) translateY(8px)}
.toolbox-wrap.visible{opacity:1;transform:scale(1) translateY(0)}
.toolbox-wrap .panel{opacity:0;transform:translateY(6px);transition:opacity 0.18s ease,transform 0.2s cubic-bezier(0.34,1.3,0.64,1)}
.toolbox-wrap.visible .panel{opacity:1;transform:translateY(0)}
.toolbox-wrap.visible .panel:nth-child(1){transition-delay:0.03s}
.toolbox-wrap.visible .panel:nth-child(2){transition-delay:0.07s}
.toolbox-wrap.visible .panel:nth-child(3){transition-delay:0.11s}
.toolbox-wrap.visible .panel:nth-child(4){transition-delay:0.15s}
.toolbox-wrap.visible .panel:nth-child(5){transition-delay:0.18s}
.toolbox-wrap .panel:nth-child(1){transition-delay:0.06s}
.toolbox-wrap .panel:nth-child(2){transition-delay:0.02s}
.toolbox-wrap .panel:nth-child(3){transition-delay:0s}
.toolbox-wrap .panel:nth-child(4){transition-delay:0s}
.toolbox-wrap .panel:nth-child(5){transition-delay:0s}
.panel{background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius);transition:border-color var(--transition)}
.panel:hover{border-color:var(--border-hover)}
.panel-body{overflow:hidden;max-height:600px;transition:max-height 0.28s cubic-bezier(0.4,0,0.2,1),opacity 0.2s;opacity:1}
.panel-body.collapsed{max-height:0;opacity:0}
.panel-head{display:flex;align-items:center;justify-content:space-between;padding:8px 11px;cursor:pointer;user-select:none;transition:background var(--transition)}
.panel-head:hover{background:var(--surface-2)}
.panel-label{font-size:9px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-3);font-family:var(--font-ui)}
.panel-right{display:flex;align-items:center;gap:6px}
.chevron{color:var(--text-3);transition:transform 0.22s cubic-bezier(0.4,0,0.2,1)}
.chevron.open{transform:rotate(180deg)}
.sep{height:1px;background:var(--border)}
.top-bar{display:flex;align-items:center;justify-content:space-between;padding:10px 12px 9px}
.tool-title{font-size:13px;font-weight:700;color:var(--text-1);letter-spacing:-0.01em;font-family:var(--font-ui)}
.status-badge{display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;padding:3px 7px 3px 6px;border-radius:var(--radius-pill);background:var(--surface-3);color:var(--text-3);transition:background var(--transition),color var(--transition);font-family:var(--font-ui)}
.status-dot{width:5px;height:5px;border-radius:50%;background:var(--text-3);transition:background var(--transition),box-shadow var(--transition)}
.status-dot.recording{background:var(--danger);box-shadow:0 0 4px var(--danger);animation:pulse-dot 1.2s ease-in-out infinite}
@keyframes pulse-dot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(0.65);opacity:0.5}}
.status-badge.recording{background:var(--danger-dim);color:var(--danger)}
.mode-toggle{display:flex;background:var(--surface-3);border-radius:var(--radius-pill);padding:2px;gap:1px}
.mode-btn{display:inline-flex;align-items:center;gap:4px;font-family:var(--font-ui);font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:4px 10px;border-radius:var(--radius-pill);border:none;background:transparent;color:var(--text-3);cursor:pointer;position:relative;z-index:1;transition:background var(--transition) 0.03s,color var(--transition) 0.03s}
.mode-btn svg{opacity:0.55;transition:opacity var(--transition)}
.mode-btn.active{background:var(--surface-1);color:var(--text-1);box-shadow:0 1px 3px rgba(0,0,0,0.4)}
.mode-btn.active svg{opacity:1}
.mode-btn:hover:not(.active){color:var(--text-2)}
.mode-btn:hover:not(.active) svg{opacity:0.8}
.controls-row{display:flex;align-items:center;gap:5px;padding:8px 11px;flex-wrap:wrap}
.ctrl-btn{display:inline-flex;align-items:center;gap:4px;padding:4px 8px;font-family:var(--font-ui);font-size:9px;font-weight:600;letter-spacing:0.02em;border-radius:var(--radius-sm);border:1px solid var(--border);background:var(--surface-2);color:var(--text-2);cursor:pointer;white-space:nowrap;transition:background var(--transition),border-color var(--transition),color var(--transition),transform 0.1s}
.ctrl-btn:hover{background:var(--surface-3);border-color:var(--border-hover);color:var(--text-1)}
.ctrl-btn:active{transform:scale(0.95)}
.ctrl-btn:disabled{opacity:0.4;cursor:not-allowed;pointer-events:none}
.ctrl-btn.primary{background:var(--pink);border-color:var(--pink);color:#fff}
.ctrl-btn.primary:hover{background:#c4176e;border-color:#c4176e}
.ctrl-btn.danger{background:var(--danger);border-color:var(--danger);color:#fff}
.ctrl-btn.danger:hover{background:#d0322a;border-color:#d0322a}
.ctrl-div{width:1px;height:14px;background:var(--border);flex-shrink:0}
.stats-row{display:grid;grid-template-columns:1fr 1fr 1fr;padding:8px 11px 10px}
.stat{display:flex;flex-direction:column;gap:2px;padding:0 6px 0 0}
.stat+.stat{padding-left:8px;border-left:1px solid var(--border)}
.stat-num{font-size:18px;font-weight:700;color:var(--text-1);line-height:1;letter-spacing:-0.03em;font-family:var(--font-ui)}
.stat-num.err{color:var(--danger)}
.stat-label{font-size:9px;font-weight:500;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-3);font-family:var(--font-ui)}
.session-head{display:flex;align-items:center;justify-content:space-between;padding:6px 11px}
.session-count{font-size:9px;color:var(--text-3);font-weight:500;letter-spacing:0.05em;text-transform:uppercase;font-family:var(--font-ui)}
.new-btn{font-family:var(--font-ui);font-size:9px;font-weight:600;letter-spacing:0.04em;color:var(--pink);background:none;border:none;cursor:pointer;padding:2px 6px;border-radius:var(--radius-sm);transition:background var(--transition)}
.new-btn:hover{background:var(--pink-dim)}
.new-btn:disabled{opacity:0.4;cursor:not-allowed}
.session-scroll{max-height:150px;overflow-y:auto}
.session-item{display:flex;align-items:center;gap:8px;padding:7px 11px;cursor:pointer;border-top:1px solid var(--border);transition:background var(--transition);position:relative}
.session-item:hover{background:var(--surface-2)}
.session-item.active{background:var(--surface-2)}
.session-item.active::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:2px;border-radius:0 2px 2px 0;background:var(--pink)}
.s-dot{width:6px;height:6px;border-radius:50%;background:var(--surface-3);border:1px solid var(--border-hover);flex-shrink:0;transition:background var(--transition),border-color var(--transition)}
.s-dot.active{background:var(--pink);border-color:var(--pink);box-shadow:0 0 6px var(--pink-glow)}
.s-info{flex:1;min-width:0}
.s-name{font-size:11px;font-weight:600;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em;font-family:var(--font-ui)}
.s-name-input{font-size:11px;font-weight:600;flex:1;border:none;background:transparent;color:var(--text-1);font-family:var(--font-ui);outline:none;border-bottom:1px solid var(--pink);padding:0}
.s-meta{font-size:9px;color:var(--text-3);font-family:var(--font-mono);margin-top:1px}
.s-actions{display:flex;gap:3px;opacity:0;transition:opacity var(--transition)}
.session-item:hover .s-actions{opacity:1}
.s-actions button{padding:3px;min-width:20px;height:20px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--border);background:var(--surface-2);color:var(--text-2);cursor:pointer;transition:background var(--transition),color var(--transition)}
.s-actions button:hover{background:var(--surface-3);color:var(--text-1)}
.selected-bar{display:none;padding:7px 11px;align-items:center;justify-content:space-between;border-top:1px solid var(--border-accent);background:var(--pink-dim)}
.selected-bar.show{display:flex}
.sel-label{font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--pink);margin-bottom:1px;font-family:var(--font-ui)}
.sel-name{font-size:11px;font-weight:600;color:var(--text-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:130px;letter-spacing:-0.01em;font-family:var(--font-ui)}
.run-btn{font-family:var(--font-ui);font-size:10px;font-weight:700;letter-spacing:0.04em;padding:5px 11px;background:var(--pink);color:#fff;border:none;border-radius:var(--radius-sm);cursor:pointer;transition:background var(--transition),transform 0.1s}
.run-btn:hover{background:#c4176e}
.run-btn:active{transform:scale(0.95)}
.mini-progress{padding:9px 11px;display:flex;align-items:center;gap:8px}
.progress-track{flex:1;height:3px;border-radius:2px;background:var(--surface-3);overflow:hidden}
.progress-fill{height:100%;width:0%;border-radius:2px;background:linear-gradient(90deg,var(--pink),#ff6ab0);position:relative;overflow:hidden;transition:width 0.35s cubic-bezier(0.4,0,0.2,1)}
.progress-fill::after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.35) 50%,transparent 100%);animation:shimmer 1.8s infinite}
@keyframes shimmer{from{transform:translateX(-100%)}to{transform:translateX(200%)}}
.progress-label{font-size:10px;font-family:var(--font-mono);color:var(--text-3);flex-shrink:0}
@keyframes step-pulse{0%,100%{box-shadow:0 0 6px var(--pink-glow)}50%{box-shadow:0 0 16px var(--pink-glow),0 0 24px color-mix(in srgb,var(--pink) 60%,transparent)}}
@keyframes log-slide-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
.step-list{display:flex;flex-direction:column}
.step-scroll{max-height:210px;overflow-y:auto}
.step{display:flex;align-items:center;gap:9px;padding:6px 11px;border-top:1px solid var(--border);transition:background var(--transition)}
.step:first-child{border-top:none}
.step:hover{background:var(--surface-2)}
.step-num{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:9px;font-weight:700;font-family:var(--font-mono);background:var(--surface-3);color:var(--text-3);border:1px solid var(--border);transition:background var(--transition),color var(--transition),border-color var(--transition),box-shadow var(--transition)}
.step-num.done{background:var(--success-dim);color:var(--success);border-color:rgba(29,179,122,0.2)}
.step-num.active{background:var(--pink);color:#fff;border-color:var(--pink);box-shadow:0 0 8px var(--pink-glow);animation:step-pulse 1.2s ease-in-out infinite}
.step-num.err{background:var(--danger-dim);color:var(--danger);border-color:rgba(232,67,58,0.2)}
.step-text{font-size:11px;color:var(--text-2);letter-spacing:-0.01em;font-family:var(--font-ui)}
.step-text.active{color:var(--text-1);font-weight:600}
.step-text.done{color:var(--text-3);text-decoration:line-through;text-decoration-color:var(--surface-3)}
.step-type{display:inline-flex;font-size:7px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;padding:1px 5px;border-radius:4px;font-family:var(--font-mono);flex-shrink:0;line-height:1.5;margin-right:1px;transition:opacity var(--transition)}
.step-type.click{background:rgba(61,142,240,0.13);color:#5b9cf5}
.step-type.input{background:rgba(29,179,122,0.13);color:#2ecc81}
.step-type.select{background:rgba(240,165,0,0.13);color:#f5b342}
.step-type.keyboard{background:rgba(233,30,140,0.13);color:#e91e8c}
.progress-footer{padding:8px 11px;border-top:1px solid var(--border);display:flex;align-items:center;gap:8px}
.log-tabs{display:flex;gap:2px;padding:7px 9px 0}
.log-tab{font-family:var(--font-ui);font-size:9px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;padding:3px 8px;border-radius:var(--radius-sm);border:none;background:transparent;color:var(--text-3);cursor:pointer;transition:background var(--transition),color var(--transition)}
.log-tab.active{background:var(--surface-3);color:var(--text-1)}
.log-entries{padding:6px 10px 8px;display:flex;flex-direction:column;gap:2px;max-height:96px;overflow-y:auto}
.log-entry{display:flex;gap:7px;font-family:var(--font-mono);font-size:10px;padding:2px 3px;border-radius:3px;transition:background var(--transition);animation:log-slide-in 0.2s ease-out both}
.log-entry:hover{background:var(--surface-2)}
.log-time{color:var(--text-3);flex-shrink:0}
.log-lvl{flex-shrink:0;font-weight:500}
.log-lvl.info{color:var(--info)}
.log-lvl.warn{color:var(--warn)}
.log-lvl.err{color:var(--danger)}
.log-msg{color:var(--text-2)}
.adv-col{display:none;flex-direction:column;gap:6px}
.adv-col.show{display:flex}
.assert-modal{position:fixed;inset:0;background:rgba(2,6,23,.55);display:none;align-items:center;justify-content:center;z-index:101}
.assert-modal.open{display:flex}
.assert-card{width:min(380px,92vw);background:var(--surface-1);border:1px solid var(--border);border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:10px}
.assert-title{font-size:13px;font-weight:700;color:var(--text-1);font-family:var(--font-ui)}
.assert-row{display:flex;flex-direction:column;gap:6px}
.assert-label{font-size:11px;color:var(--text-2);font-family:var(--font-ui)}
.assert-input,.assert-select{background:var(--surface-2);border:1px solid var(--border);color:var(--text-1);border-radius:var(--radius-sm);padding:7px 9px;font:12px var(--font-ui)}
.assert-input::placeholder{color:var(--text-3)}
.assert-actions{display:flex;justify-content:flex-end;gap:8px}
.assert-actions button{font-family:var(--font-ui);font-size:12px;font-weight:600;padding:5px 11px;border-radius:var(--radius-sm);border:none;cursor:pointer}
.assert-actions button.primary{background:var(--pink);color:#fff}
.assert-actions button.primary:hover{background:#c4176e}
.assert-hint{font-size:11px;color:var(--text-3);font-family:var(--font-ui)}
.assert-error{font-size:11px;color:var(--danger);min-height:16px;font-family:var(--font-ui)}
*{scrollbar-width:thin;scrollbar-color:var(--surface-3) transparent}
::-webkit-scrollbar{width:8px;height:8px}
::-webkit-scrollbar-track{background:transparent;border-radius:4px}
::-webkit-scrollbar-thumb{background:var(--surface-3);border-radius:4px;border:2px solid transparent;background-clip:content-box}
::-webkit-scrollbar-thumb:hover{background:var(--surface-2);background-clip:content-box}
</style>
<button class="fab" id="toolbox-fab">
  <svg class="icon-open" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"><line x1="2.5" y1="4" x2="13.5" y2="4"/><line x1="2.5" y1="8" x2="13.5" y2="8"/><line x1="2.5" y1="12" x2="13.5" y2="12"/></svg>
  <svg class="icon-close" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><line x1="1.5" y1="1.5" x2="11.5" y2="11.5"/><line x1="11.5" y1="1.5" x2="1.5" y2="11.5"/></svg>
</button>
<div class="toolbox-wrap hidden" id="toolbox-wrap">
  <div class="panel">
    <div class="top-bar">
      <div style="display:flex;align-items:center;gap:7px">
        <span class="tool-title">Kazu Fira</span>
        <span class="status-badge" id="toolbox-state-badge">
          <span class="status-dot" id="toolbox-state-dot"></span>
          <span class="status-text" id="toolbox-state-text">Idle</span>
        </span>
      </div>
      <div class="mode-toggle" role="radiogroup" aria-label="Mode">
        <button class="mode-btn active" id="toolbox-mode-simple" role="radio" aria-checked="true">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="4" cy="4" r="2.5"/></svg>Simple
        </button>
        <button class="mode-btn" id="toolbox-mode-adv" role="radio" aria-checked="false">
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="4" cy="4" r="2.2"/><path d="M4 1v1M4 6v1M1 4h1M6 4h1"/></svg>Advanced
        </button>
      </div>
    </div>
    <div class="sep"></div>
    <div class="controls-row">
      <button class="ctrl-btn primary" id="toolbox-record">${ICONS.record}<span>Record</span></button>
      <button class="ctrl-btn" id="toolbox-stop" disabled>${ICONS.stop}<span>Stop</span></button>
      <div class="ctrl-div"></div>
      <button class="ctrl-btn" id="toolbox-run">${ICONS.play}<span>Run</span></button>
      <button class="ctrl-btn" id="toolbox-pause" disabled>${ICONS.pause}<span>Pause</span></button>
      <button class="ctrl-btn" id="toolbox-step" disabled>${ICONS.step}<span>Step</span></button>
    </div>
    <div class="controls-row">
      <button class="ctrl-btn" id="toolbox-export">${ICONS.export}<span>Export</span></button>
      <button class="ctrl-btn" id="toolbox-assert">${ICONS.assert}<span>Assert</span></button>
      <button class="ctrl-btn" id="toolbox-scan">${ICONS.scan}<span>Scan</span></button>
      <button class="ctrl-btn" id="toolbox-save">${ICONS.save}<span>Save</span></button>
    </div>
    <div class="sep"></div>
    <div class="stats-row">
      <div class="stat"><span class="stat-num" id="toolbox-count">0</span><span class="stat-label">Mapped</span></div>
      <div class="stat"><span class="stat-num" id="toolbox-sessions-count">0</span><span class="stat-label">Sessions</span></div>
      <div class="stat"><span class="stat-num err" id="toolbox-errors">0</span><span class="stat-label">Errors</span></div>
    </div>
  </div>
  <div class="panel" id="p-sessions">
    <div class="panel-head" data-panel="p-sessions">
      <span class="panel-label">Sessions</span>
      <div class="panel-right">
        <svg class="chevron open" id="chev-p-sessions" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="2,4 6,8 10,4"/></svg>
      </div>
    </div>
    <div class="panel-body" id="body-p-sessions">
      <div class="session-head">
        <span class="session-count" id="toolbox-session-count-label">0 recordings</span>
        <button class="new-btn" id="toolbox-new-session">+ New</button>
      </div>
      <div class="selected-bar" id="toolbox-selected-bar">
        <div style="min-width:0"><div class="sel-label">Selected</div><div class="sel-name" id="toolbox-sel-name">Select a session</div></div>
        <button class="run-btn" id="toolbox-sel-run">▶ Run</button>
      </div>
      <div class="session-scroll" id="toolbox-sessions-grid"></div>
    </div>
  </div>
  <div class="panel" id="p-progress">
    <div class="panel-head" data-panel="p-progress">
      <span class="panel-label">Run progress</span>
      <div class="panel-right">
        <span style="font-size:10px;font-family:var(--font-mono);color:var(--text-3)" id="toolbox-progress-counter">0/0</span>
        <svg class="chevron open" id="chev-p-progress" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="2,4 6,8 10,4"/></svg>
      </div>
    </div>
    <div class="panel-body" id="body-p-progress">
      <div class="mini-progress">
        <div class="progress-track"><div class="progress-fill" id="toolbox-progress-fill"></div></div>
        <span class="progress-label" id="toolbox-progress-label">0 / 0</span>
      </div>
    </div>
  </div>
  <div class="adv-col" id="adv-col">
    <div class="panel" id="p-steps">
      <div class="panel-head" data-panel="p-steps">
        <span class="panel-label">Step detail</span>
        <div class="panel-right">
          <svg class="chevron open" id="chev-p-steps" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="2,4 6,8 10,4"/></svg>
        </div>
      </div>
      <div class="panel-body" id="body-p-steps">
        <div class="step-scroll"><div class="step-list" id="toolbox-step-list"></div></div>
        <div class="progress-footer">
          <div class="progress-track"><div class="progress-fill"></div></div>
          <span class="progress-label">0 / 0</span>
        </div>
      </div>
    </div>
    <div class="panel" id="p-log">
      <div class="panel-head" data-panel="p-log">
        <span class="panel-label">System log</span>
        <div class="panel-right">
          <svg class="chevron open" id="chev-p-log" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="2,4 6,8 10,4"/></svg>
        </div>
      </div>
      <div class="panel-body" id="body-p-log">
        <div class="log-tabs">
          <button class="log-tab active" data-level="all">All</button>
          <button class="log-tab" data-level="info">Info</button>
          <button class="log-tab" data-level="warn">Warn</button>
          <button class="log-tab" data-level="err">Error</button>
        </div>
        <div class="log-entries" id="toolbox-log-entries">
          <div class="log-entry" style="color:var(--text-3);font-size:11px;text-align:center;padding:16px 8px;font-family:var(--font-ui);display:block">No log entries yet</div>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="assert-modal" id="toolbox-assert-modal">
  <div class="assert-card">
    <div class="assert-title">Add assertion step</div>
    <div class="assert-row">
      <label class="assert-label">Selector</label>
      <input class="assert-input" id="toolbox-assert-selector" placeholder="#email or [name=&quot;email&quot;]" />
    </div>
    <div class="assert-row">
      <label class="assert-label">Property</label>
      <select class="assert-select" id="toolbox-assert-property">
        <option value="visible">visible</option>
        <option value="value">value</option>
        <option value="text">text</option>
        <option value="checked">checked</option>
      </select>
    </div>
    <div class="assert-row">
      <label class="assert-label">Expected</label>
      <input class="assert-input" id="toolbox-assert-expected" placeholder="optional for visible" />
      <div class="assert-hint" id="toolbox-assert-hint">For checked use true/false.</div>
      <div class="assert-error" id="toolbox-assert-error"></div>
    </div>
    <div class="assert-actions">
      <button id="toolbox-assert-cancel">Cancel</button>
      <button class="primary" id="toolbox-assert-apply">Add</button>
    </div>
  </div>
</div>`;

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const node = root.querySelector(selector);
  if (!(node instanceof Element)) {
    throw new Error(`Toolbox node not found: ${selector}`);
  }
  return node as T;
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

function toSelectorStrategy(
  selector: string,
):
  | { kind: "id"; value: string }
  | { kind: "name"; value: string }
  | { kind: "css"; value: string } {
  if (selector.startsWith("#") && selector.length > 1) {
    return { kind: "id", value: selector.slice(1) };
  }
  if (selector.startsWith('[name="') && selector.endsWith('"]')) {
    return { kind: "name", value: selector.slice(7, -2) };
  }
  return { kind: "css", value: selector };
}

function scanFieldCount(): number {
  return Array.from(
    document.querySelectorAll(
      "input,select,textarea,[contenteditable='true'],[contenteditable='']",
    ),
  ).filter((node) => node instanceof HTMLElement && !node.closest(`#${ROOT_ID}`)).length;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

function injectFontLink(root: Node): void {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500&family=Geist:wght@400;500;600;700&display=swap";
  root.appendChild(link);
}

export function mountToolbox(storage: Storage = localStorage): void {
  if (document.documentElement.getAttribute(MOUNT_ATTR) === "true") {
    return;
  }
  document.documentElement.setAttribute(MOUNT_ATTR, "true");

  const host = document.createElement("div");
  host.id = ROOT_ID;
  document.body.appendChild(host);
  host.style.all = "initial";

  const shadow = host.attachShadow({ mode: "open" });
  injectFontLink(shadow);
  shadow.innerHTML = TOOLBOX_HTML;

  const elements: ToolboxElements = {
    fab: requireElement(shadow, "#toolbox-fab"),
    toolboxWrap: requireElement(shadow, "#toolbox-wrap"),
    modeSimple: requireElement(shadow, "#toolbox-mode-simple"),
    modeAdv: requireElement(shadow, "#toolbox-mode-adv"),
    stateBadge: requireElement(shadow, "#toolbox-state-badge"),
    stateDot: requireElement(shadow, "#toolbox-state-dot"),
    stateText: requireElement(shadow, "#toolbox-state-text"),
    count: requireElement(shadow, "#toolbox-count"),
    sessionsCount: requireElement(shadow, "#toolbox-sessions-count"),
    sessionsCountLabel: requireElement(shadow, "#toolbox-session-count-label"),
    errors: requireElement(shadow, "#toolbox-errors"),
    selName: requireElement(shadow, "#toolbox-sel-name"),
    selRun: requireElement(shadow, "#toolbox-sel-run"),
    selBar: requireElement(shadow, "#toolbox-selected-bar"),
    stepList: requireElement(shadow, "#toolbox-step-list"),
    progressFill: requireElement(shadow, "#toolbox-progress-fill"),
    progressLabel: requireElement(shadow, "#toolbox-progress-label"),
    progressCounter: requireElement(shadow, "#toolbox-progress-counter"),
    record: requireElement(shadow, "#toolbox-record"),
    stop: requireElement(shadow, "#toolbox-stop"),
    run: requireElement(shadow, "#toolbox-run"),
    pause: requireElement(shadow, "#toolbox-pause"),
    step: requireElement(shadow, "#toolbox-step"),
    exportBtn: requireElement(shadow, "#toolbox-export"),
    assertBtn: requireElement(shadow, "#toolbox-assert"),
    scan: requireElement(shadow, "#toolbox-scan"),
    save: requireElement(shadow, "#toolbox-save"),
    newSession: requireElement(shadow, "#toolbox-new-session"),
    sessionsGrid: requireElement(shadow, "#toolbox-sessions-grid"),
    chevSessions: requireElement(shadow, "#chev-p-sessions"),
    chevProgress: requireElement(shadow, "#chev-p-progress"),
    chevSteps: requireElement(shadow, "#chev-p-steps"),
    chevLog: requireElement(shadow, "#chev-p-log"),
    bodySessions: requireElement(shadow, "#body-p-sessions"),
    bodyProgress: requireElement(shadow, "#body-p-progress"),
    bodySteps: requireElement(shadow, "#body-p-steps"),
    bodyLog: requireElement(shadow, "#body-p-log"),
    advCol: requireElement(shadow, "#adv-col"),
    assertModal: requireElement(shadow, "#toolbox-assert-modal"),
    assertSelector: requireElement(shadow, "#toolbox-assert-selector"),
    assertProperty: requireElement(shadow, "#toolbox-assert-property"),
    assertExpected: requireElement(shadow, "#toolbox-assert-expected"),
    assertHint: requireElement(shadow, "#toolbox-assert-hint"),
    assertError: requireElement(shadow, "#toolbox-assert-error"),
    assertCancel: requireElement(shadow, "#toolbox-assert-cancel"),
    assertApply: requireElement(shadow, "#toolbox-assert-apply"),
    systemLogEntries: requireElement(shadow, "#toolbox-log-entries"),
  };

  const core = createToolboxCoreFacade();
  const logManager = new LogManager();
  const state: ToolboxState = {
    mode: "simple",
    panelCollapsed: {},
    fabOpen: false,
    currentSessionId: "",
    renamingId: "",
    runningSessionId: "",
    replayPaused: false,
    currentStepIndex: -1,
    lastRunLabel: "Never",
    errorCount: 0,
    lastReplay: null,
    logFilter: "all",
    logAutoScroll: true,
  };
  let observer: MutationObserver | null = null;
  let scanTimer = 0;

  const getSessions = (): StoredSessionV2[] => readStoredSessions(storage);

  const setStatus = (status: "idle" | "recording" | "running"): void => {
    elements.stateText.textContent =
      status === "recording" ? "Recording" : status === "running" ? "Running" : "Idle";
    const isRecording = status === "recording";
    elements.stateDot.classList.toggle("recording", isRecording);
    elements.stateBadge.classList.toggle("recording", isRecording);
    elements.fab.classList.toggle("recording", isRecording);
  };

  const updateButtons = (): void => {
    const hasSelectedSession = Boolean(
      state.currentSessionId &&
        getSessions().some((session) => session.id === state.currentSessionId),
    );
    elements.record.disabled = core.isRecording() || Boolean(state.runningSessionId);
    elements.stop.disabled = !core.isRecording() && !state.runningSessionId;
    elements.run.disabled = core.isRecording();
    elements.pause.disabled = !state.runningSessionId;
    const pauseSpan = elements.pause.querySelector("span");
    if (pauseSpan) pauseSpan.textContent = state.replayPaused ? "Resume" : "Pause";
    elements.step.disabled = !state.runningSessionId || !state.replayPaused;
    elements.exportBtn.disabled =
      core.isRecording() || Boolean(state.runningSessionId) || !hasSelectedSession;
    elements.assertBtn.disabled =
      core.isRecording() || Boolean(state.runningSessionId) || !hasSelectedSession;
    elements.scan.disabled = core.isRecording();
    elements.save.disabled = !hasSelectedSession;
    elements.newSession.disabled = core.isRecording() || Boolean(state.runningSessionId);
  };

  const refreshScan = (): void => {
    elements.count.textContent = String(scanFieldCount());
    elements.errors.textContent = String(state.errorCount);
  };

  const renderSystemLogs = (): void => {
    const entries = logManager.getFiltered(state.logFilter);
    if (entries.length === 0) {
      elements.systemLogEntries.innerHTML = `<div class="log-entry" style="color:var(--text-3);font-size:11px;text-align:center;padding:16px 8px;font-family:var(--font-ui);display:block">No log entries yet</div>`;
      return;
    }
    elements.systemLogEntries.innerHTML = entries
      .map((e) => {
        const cls = e.level === "info" ? "info" : e.level;
        return `<div class="log-entry ${cls}" data-level="${e.level}">
        <span class="log-time">${formatTime(e.ts)}</span>
        <span class="log-lvl ${cls}">${e.level}</span>
        <span class="log-msg">${escapeHtml(e.message)}</span>
      </div>`;
      })
      .join("");
    if (state.logAutoScroll) {
      elements.systemLogEntries.scrollTop = elements.systemLogEntries.scrollHeight;
    }
  };

  const setLogFilter = (level: LogLevel | "all"): void => {
    state.logFilter = level;
    shadow
      .querySelectorAll<HTMLButtonElement>(".log-tab")
      .forEach((btn) => btn.classList.toggle("active", btn.dataset["level"] === level));
    renderSystemLogs();
  };

  logManager.onUpdate = () => {
    renderSystemLogs();
  };

  const renderDetail = (): void => {
    const activeSession =
      getSessions().find((session) => session.id === state.currentSessionId) ?? null;

    if (!activeSession) {
      elements.stepList.innerHTML = `<div class="step-list"><div style="color:var(--text-3);font-size:11px;text-align:center;padding:24px 8px;font-family:var(--font-ui)">Select a session</div></div>`;
      updateButtons();
      return;
    }

    elements.stepList.innerHTML = "";

    if (activeSession.steps.length === 0) {
      elements.stepList.innerHTML = `<div style="color:var(--text-3);font-size:11px;text-align:center;padding:24px 8px;font-family:var(--font-ui)">No steps recorded yet</div>`;
      updateButtons();
      return;
    }

    const pct =
      state.currentStepIndex >= 0 && activeSession.steps.length > 0
        ? Math.round(((state.currentStepIndex + 1) / activeSession.steps.length) * 100)
        : 0;
    elements.progressFill.style.width = `${pct}%`;
    elements.progressLabel.textContent = `${state.currentStepIndex >= 0 ? state.currentStepIndex + 1 : 0} / ${activeSession.steps.length}`;
    elements.progressCounter.textContent = `${state.currentStepIndex >= 0 ? state.currentStepIndex + 1 : 0}/${activeSession.steps.length}`;

    activeSession.steps.forEach((step, index) => {
      const row = document.createElement("div");
      row.className = "step";

      let numClass = "";
      let textClass = "";
      if (state.runningSessionId === activeSession.id && index < state.currentStepIndex) {
        numClass = "done";
        textClass = "done";
      } else if (state.runningSessionId === activeSession.id && index === state.currentStepIndex) {
        numClass = "active";
        textClass = "active";
      }

      const detail =
        step.type === "wait"
          ? `${step.displayName}`
          : step.type === "navigate"
            ? `${step.displayName}`
            : `${step.displayName} -> ${step.selector}`;

      const typeClass =
        step.type === "click" ||
        step.type === "input" ||
        step.type === "select" ||
        step.type === "keyboard"
          ? step.type
          : "";
      const typeBadge = typeClass ? `<span class="step-type ${typeClass}">${step.type}</span>` : "";

      row.innerHTML = `<span class="step-num ${numClass}">${index + 1}</span>${typeBadge}<span class="step-text ${textClass}">${escapeHtml(detail)}</span>`;
      elements.stepList.appendChild(row);
    });

    updateButtons();
  };

  const renderSessionsGrid = (): void => {
    const sessions = getSessions();
    elements.sessionsGrid.innerHTML = "";
    elements.sessionsCount.textContent = String(sessions.length);
    elements.sessionsCountLabel.textContent = `${sessions.length} recording${sessions.length !== 1 ? "s" : ""}`;

    if (!sessions.some((session) => session.id === state.currentSessionId)) {
      state.currentSessionId = "";
    }

    const activeSession = sessions.find((session) => session.id === state.currentSessionId);
    elements.selBar.classList.toggle("show", Boolean(activeSession));
    elements.selName.textContent = activeSession ? sessionLabel(activeSession) : "Select a session";

    for (const session of sessions) {
      const item = document.createElement("div");
      const isActive = state.currentSessionId === session.id;
      item.className = `session-item${isActive ? " active" : ""}`;
      item.setAttribute("data-session-id", session.id);

      item.innerHTML = `
        <span class="s-dot${isActive ? " active" : ""}"></span>
        <div class="s-info">
          <div class="s-name">${sessionLabel(session)}</div>
          <div class="s-meta">${session.steps.length} steps · ${formatRelativeDate(session.lastRunAt)}</div>
        </div>
        <div class="s-actions">
          <button data-action="rename" title="Rename">${ICONS.edit}</button>
          <button data-action="delete" title="Delete">${ICONS.close}</button>
        </div>`;

      item.addEventListener("click", (event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button")) return;
        state.currentSessionId = state.currentSessionId === session.id ? "" : session.id;
        renderSessionsGrid();
      });

      item.querySelector("[data-action='rename']")?.addEventListener("click", (event) => {
        event.stopPropagation();
        state.renamingId = session.id;
        renderSessionsGrid();
      });

      item.querySelector("[data-action='delete']")?.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteStoredSession(session.id, storage);
        if (state.currentSessionId === session.id) {
          state.currentSessionId = "";
        }
        logManager.info("Session", "deleted session");
        renderSessionsGrid();
      });

      elements.sessionsGrid.appendChild(item);
    }

    renderDetail();
    refreshScan();
  };

  const scheduleScan = (): void => {
    if (scanTimer) {
      window.clearTimeout(scanTimer);
    }
    scanTimer = window.setTimeout(refreshScan, 120);
  };

  const updateAssertHint = (): void => {
    const property = elements.assertProperty.value as AssertionProperty;
    if (property === "visible") {
      elements.assertExpected.placeholder = "not required for visible";
      elements.assertHint.textContent = "Expected is optional for visible assertions.";
      return;
    }
    if (property === "checked") {
      elements.assertExpected.placeholder = "true or false";
      elements.assertHint.textContent = "Use true/false for checked assertions.";
      return;
    }
    elements.assertExpected.placeholder = "expected value";
    elements.assertHint.textContent = "Expected value is optional.";
  };

  const closeAssertModal = (): void => {
    elements.assertModal.classList.remove("open");
  };

  const setAssertError = (message: string): void => {
    elements.assertError.textContent = message;
  };

  const clearAssertError = (): void => {
    elements.assertError.textContent = "";
  };

  const parseAssertionInput = (): {
    selector: string;
    property: AssertionProperty;
    expected: string | boolean | undefined;
  } | null => {
    const selector = elements.assertSelector.value.trim();
    if (!selector) {
      setAssertError("Selector is required.");
      return null;
    }
    const property = elements.assertProperty.value as AssertionProperty;
    const expectedRaw = property === "visible" ? "" : elements.assertExpected.value.trim();
    if (
      property === "checked" &&
      expectedRaw &&
      expectedRaw !== "true" &&
      expectedRaw !== "false"
    ) {
      setAssertError("Checked expects true or false.");
      return null;
    }
    clearAssertError();
    const expected =
      expectedRaw === ""
        ? undefined
        : property === "checked"
          ? expectedRaw === "true"
          : expectedRaw;
    return { selector, property, expected };
  };

  const openAssertModal = (): void => {
    elements.assertSelector.value = "#";
    elements.assertProperty.value = "visible";
    elements.assertExpected.value = "";
    clearAssertError();
    updateAssertHint();
    elements.assertModal.classList.add("open");
    queueMicrotask(() => {
      elements.assertSelector.focus();
      elements.assertSelector.select();
    });
  };

  const runSelectedSession = async (sessionId = state.currentSessionId): Promise<void> => {
    const session = getSessions().find((item) => item.id === sessionId);
    if (!session) {
      logManager.warn("Replay", "no recording to run");
      return;
    }

    state.runningSessionId = session.id;
    state.replayPaused = false;
    state.lastReplay = null;
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
        logManager.error("Replay", message);
        refreshScan();
      },
      onPause: () => {
        state.replayPaused = true;
        renderDetail();
      },
      onResume: () => {
        state.replayPaused = false;
        renderDetail();
      },
      onComplete: (result) => {
        state.runningSessionId = "";
        state.replayPaused = false;
        state.lastReplay = result;
        state.currentStepIndex = -1;
        state.lastRunLabel = "Just now";
        setStatus("idle");
        updateStoredSession(session.id, (s) => ({ ...s, lastRunAt: Date.now() }), storage);
        renderSessionsGrid();
        logManager.success("Replay", `run complete (${session.steps.length} steps)`);
        logManager.info(
          "Replay",
          `total ${Math.round(result.totalMs)}ms, slow steps ${result.slowSteps.length}`,
        );
      },
    });
  };

  const stopCurrentAction = (): void => {
    if (core.isRecording()) {
      const formatDate = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const suggestedName = `Recording ${formatDate.format(new Date())}`;
      const session = core.stopRecording(suggestedName);
      if (session) {
        session.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        saveStoredSession(session, storage);
        state.currentSessionId = session.id;
        logManager.success("Recording", `stopped (${session.steps.length} steps) - auto-saved`);
      } else {
        state.currentSessionId = "";
        logManager.info("Recording", "stopped");
      }
      setStatus("idle");
      renderSessionsGrid();
      return;
    }

    state.runningSessionId = "";
    state.replayPaused = false;
    state.currentStepIndex = -1;
    core.stopReplay();
    setStatus("idle");
    renderSessionsGrid();
    logManager.info("Replay", "run stopped");
  };

  const startRecording = (): void => {
    state.currentSessionId = "";
    core.startRecording();
    setStatus("recording");
    updateButtons();
    logManager.info("Recording", "started");
  };

  // Panel collapse
  const panelConfig: Record<string, { body: HTMLElement; chevron: HTMLElement }> = {
    "p-sessions": { body: elements.bodySessions, chevron: elements.chevSessions },
    "p-progress": { body: elements.bodyProgress, chevron: elements.chevProgress },
    "p-steps": { body: elements.bodySteps, chevron: elements.chevSteps },
    "p-log": { body: elements.bodyLog, chevron: elements.chevLog },
  };

  shadow.querySelectorAll<HTMLElement>(".panel-head").forEach((head) => {
    head.addEventListener("click", () => {
      const id = head.dataset["panel"];
      if (!id || !panelConfig[id]) return;
      const collapsed = !state.panelCollapsed[id];
      state.panelCollapsed[id] = collapsed;
      panelConfig[id].body.classList.toggle("collapsed", collapsed);
      panelConfig[id].chevron.classList.toggle("open", !collapsed);
    });
  });

  // FAB toggle
  elements.fab.addEventListener("click", () => {
    state.fabOpen = !state.fabOpen;
    elements.fab.classList.toggle("active", state.fabOpen);
    elements.toolboxWrap.classList.toggle("hidden", !state.fabOpen);
    elements.toolboxWrap.classList.toggle("visible", state.fabOpen);
  });

  // Mode toggle
  elements.modeSimple.addEventListener("click", () => {
    state.mode = "simple";
    elements.modeSimple.classList.add("active");
    elements.modeSimple.setAttribute("aria-checked", "true");
    elements.modeAdv.classList.remove("active");
    elements.modeAdv.setAttribute("aria-checked", "false");
    elements.advCol.classList.remove("show");
  });

  elements.modeAdv.addEventListener("click", () => {
    state.mode = "advanced";
    elements.modeAdv.classList.add("active");
    elements.modeAdv.setAttribute("aria-checked", "true");
    elements.modeSimple.classList.remove("active");
    elements.modeSimple.setAttribute("aria-checked", "false");
    elements.advCol.classList.add("show");
  });

  observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });

  elements.record.addEventListener("click", startRecording);
  elements.stop.addEventListener("click", stopCurrentAction);
  elements.run.addEventListener("click", () => {
    void runSelectedSession();
  });
  elements.pause.addEventListener("click", () => {
    if (!state.runningSessionId) return;
    if (state.replayPaused) {
      core.resumeReplay();
      state.replayPaused = false;
    } else {
      core.pauseReplay();
      state.replayPaused = true;
    }
    updateButtons();
  });
  elements.step.addEventListener("click", async () => {
    if (!state.runningSessionId || !state.replayPaused) return;
    await core.stepReplay();
  });

  elements.selRun.addEventListener("click", () => {
    if (state.currentSessionId) {
      void runSelectedSession(state.currentSessionId);
    }
  });

  elements.exportBtn.addEventListener("click", async () => {
    const session = getSessions().find((item) => item.id === state.currentSessionId);
    if (!session) {
      logManager.warn("Export", "select a session to export");
      return;
    }
    const code = core.exportSessionToPlaywright(session);
    try {
      await navigator.clipboard.writeText(code);
      logManager.info("Export", "playwright export copied to clipboard");
    } catch {
      const blob = new Blob([code], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${sessionLabel(session).replace(/\s+/g, "-").toLowerCase()}.playwright.ts`;
      link.click();
      URL.revokeObjectURL(url);
      logManager.info("Export", "playwright export downloaded");
    }
  });
  elements.assertBtn.addEventListener("click", () => {
    const session = getSessions().find((item) => item.id === state.currentSessionId);
    if (!session) {
      logManager.warn("Assert", "select a saved session first");
      return;
    }
    openAssertModal();
  });

  elements.assertCancel.addEventListener("click", closeAssertModal);
  elements.assertProperty.addEventListener("change", updateAssertHint);
  elements.assertExpected.addEventListener("input", clearAssertError);
  elements.assertSelector.addEventListener("input", clearAssertError);
  elements.assertModal.addEventListener("click", (event) => {
    if (event.target === elements.assertModal) {
      closeAssertModal();
    }
  });
  elements.assertModal.addEventListener("keydown", (event) => {
    if (!elements.assertModal.classList.contains("open")) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeAssertModal();
      return;
    }
    if (event.key === "Enter" && event.target !== elements.assertProperty) {
      event.preventDefault();
      elements.assertApply.click();
    }
  });
  elements.assertApply.addEventListener("click", () => {
    const session = getSessions().find((item) => item.id === state.currentSessionId);
    if (!session) {
      logManager.warn("Assert", "select a saved session first");
      return;
    }

    const parsed = parseAssertionInput();
    if (!parsed) {
      return;
    }
    const { selector, property, expected } = parsed;

    const assertionStep = createAssertStep(toSelectorStrategy(selector), property, expected);
    const displaySuffix = expected !== undefined ? ` = ${String(expected)}` : "";
    const appendedStep = {
      type: "assert" as const,
      scriptStep: assertionStep,
      selector,
      selectors: [selector],
      displayName: `Assert ${property}${displaySuffix}`,
      tagName: "assertion",
      assertion: property,
      expected: expected !== undefined ? String(expected) : undefined,
      ts: assertionStep.timestamp,
    };

    updateStoredSession(
      session.id,
      (current) => ({
        ...current,
        updatedAt: Date.now(),
        steps: [...current.steps, appendedStep],
      }),
      storage,
    );
    logManager.info("Assert", `assert step added (${property})`);
    closeAssertModal();
    renderSessionsGrid();
  });
  elements.scan.addEventListener("click", refreshScan);
  elements.save.addEventListener("click", () => {
    logManager.info("Session", "nothing to save");
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
    logManager.info("Session", "new session created");
  });

  // Log filter buttons
  shadow.querySelectorAll<HTMLButtonElement>(".log-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      setLogFilter((btn.dataset["level"] as LogLevel | "all") || "all");
    });
  });

  elements.systemLogEntries.addEventListener("scroll", () => {
    const el = elements.systemLogEntries;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
    state.logAutoScroll = atBottom;
  });

  renderSessionsGrid();
  refreshScan();
  renderSystemLogs();
}
