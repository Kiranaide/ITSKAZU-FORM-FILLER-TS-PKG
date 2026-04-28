import http from "node:http";
import https from "node:https";
import net from "node:net";
import { brotliDecompress, gunzip, inflate } from "node:zlib";
import { promisify } from "node:util";
import { injectToolbar } from "./injector.js";
import type { CliOptions } from "./types.js";
import { attachToolboxWs } from "./proxy-ws.js";

const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
const brotliAsync = promisify(brotliDecompress);

const TOOLBOX_PATH = "/__toolbox/client.js";
const COMMON_BINARY_TYPES = [
  "image/",
  "font/",
  "application/octet-stream",
  "application/pdf",
];

export async function createProxyServer(options: CliOptions): Promise<void> {
  const { appPort, port, workspace } = options;
  const upstreamHost = options.host ?? "localhost";
  const upstream = `http://${upstreamHost}:${appPort}`;

  console.log(`\n🌐 Starting proxy server...`);
  console.log(`   Proxy to: ${upstream}`);
  console.log(`   Workspace: ${workspace}`);
  console.log(`   Open http://localhost:${port} in your browser\n`);

  const server = http.createServer(async (req, res) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("Missing request URL");
      return;
    }

    if (req.url === TOOLBOX_PATH) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.end(generateClientBundle());
      return;
    }

    try {
      await proxyHttpRequest(req, res, upstream, port);
    } catch (error) {
      res.statusCode = 502;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`Proxy error: ${(error as Error).message}`);
    }
  });

  attachToolboxWs(server, workspace);

  server.on("upgrade", (req, socket, head) => {
    if (!req.url || req.url === "/__toolbox/ws") return;
    const upstreamSocket = net.createConnection(
      { host: upstreamHost, port: appPort },
      () => {
        const headers = [
          `GET ${req.url} HTTP/1.1`,
          `Host: ${upstreamHost}:${appPort}`,
          "Connection: Upgrade",
          "Upgrade: websocket",
          ...Object.entries(req.headers)
            .filter(
              ([key]) =>
                ![
                  "connection",
                  "upgrade",
                  "host",
                  "sec-websocket-key",
                  "sec-websocket-version",
                ].includes(key.toLowerCase()),
            )
            .map(
              ([key, value]) =>
                `${key}: ${Array.isArray(value) ? value.join(", ") : value}`,
            ),
          "",
          "",
        ];
        upstreamSocket.write(headers.join("\r\n"));
        if (head.length > 0) upstreamSocket.write(head);
        socket.pipe(upstreamSocket).pipe(socket);
      },
    );
    upstreamSocket.on("error", () => socket.destroy());
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
}

async function proxyHttpRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  upstream: string,
  proxyPort: number,
): Promise<void> {
  const target = new URL(req.url ?? "/", upstream);
  const isHttps = target.protocol === "https:";
  const client = isHttps ? https : http;
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;
  delete headers["accept-encoding"];

  const proxyReq = client.request(
    target,
    { method: req.method, headers },
    async (proxyRes) => {
      const responseHeaders = normalizeHeaders(proxyRes.headers);
      const contentType = String(responseHeaders["content-type"] ?? "");
      const contentEncoding = String(responseHeaders["content-encoding"] ?? "");
      const shouldInject = req.method === "GET" && isHtmlResponse(contentType);

      if (!shouldInject) {
        writeHead(res, proxyRes.statusCode ?? 200, responseHeaders);
        proxyRes.pipe(res);
        return;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of proxyRes) chunks.push(Buffer.from(chunk));
      const decoded = await decodeBody(Buffer.concat(chunks), contentEncoding);
      const injected = injectToolbar(decoded.toString("utf8"), {
        frameworks: [],
        port: proxyPort,
        toolbarPath: "/__toolbox/client.js",
      });
      const payload = Buffer.from(injected, "utf8");
      delete responseHeaders["content-encoding"];
      delete responseHeaders["content-length"];
      delete responseHeaders["x-frame-options"];
      delete responseHeaders["content-security-policy"];
      responseHeaders["content-length"] = String(payload.byteLength);
      writeHead(res, proxyRes.statusCode ?? 200, responseHeaders);
      res.end(payload);
    },
  );

  proxyReq.on("error", (error) => {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end(`Upstream unavailable: ${(error as Error).message}`);
  });

  req.pipe(proxyReq);
}

function normalizeHeaders(
  headers: http.IncomingHttpHeaders,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) out[key.toLowerCase()] = value.join(", ");
    else out[key.toLowerCase()] = value;
  }
  return out;
}

function writeHead(
  res: http.ServerResponse,
  statusCode: number,
  headers: Record<string, string>,
): void {
  res.writeHead(statusCode, headers);
}

function isHtmlResponse(contentType: string): boolean {
  return /text\/html|application\/xhtml\+xml/i.test(contentType);
}

async function decodeBody(body: Buffer, encoding: string): Promise<Buffer> {
  if (encoding.includes("br")) return Buffer.from(await brotliAsync(body));
  if (encoding.includes("gzip")) return Buffer.from(await gunzipAsync(body));
  if (encoding.includes("deflate"))
    return Buffer.from(await inflateAsync(body));
  return body;
}

function generateClientBundle(): string {
  return `(${clientBundle.toString()})();`;
}

function clientBundle(): void {
  const MOUNT_ATTR = "data-toolbox-mounted";
  const STORAGE_KEY = "itskazu-form-filler:sessions:v2";
  const LEGACY_KEY = "itskazu-form-filler:latest-recording";
  const MAX_SESSIONS = 50;
  const DYNAMIC_ID_PATTERN =
    /(^|[-_:])(r[a-z0-9]+|react-aria|radix|headlessui|base-ui)([-_:]|$)/i;

  type StepKind = "fill" | "check" | "click" | "keyboard";
  type Step = {
    type: StepKind;
    selector: string;
    selectors: string[];
    displayName: string;
    tagName: string;
    inputType?: string;
    value?: string;
    checked?: boolean;
    ts: number;
    elementKey?: string;
    formKey?: string;
    optionText?: string;
    role?: string;
  };
  type Session = {
    id: string;
    schemaVersion: "2";
    name: string;
    createdAt: string;
    url: string;
    userAgent: string;
    steps: Step[];
  };

  if (document.documentElement.getAttribute(MOUNT_ATTR) === "true") return;
  document.documentElement.setAttribute(MOUNT_ATTR, "true");

  const root = document.createElement("div");
  root.id = "__toolbox-root";
  document.body.appendChild(root);

  const shadow = root.attachShadow({ mode: "open" });
  const tablerIcon = (body: string, extraClass = ""): string => {
    const className = `icon icon-tabler ${extraClass}`.trim();
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path>${body}</svg>`;
  };
  const tablerFillIcon = (body: string, extraClass = ""): string => {
    const className = `icon icon-tabler ${extraClass}`.trim();
    return `<svg xmlns="http://www.w3.org/2000/svg" class="${className}" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="currentColor" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"></path>${body}</svg>`;
  };
  const ICONS = {
    chevronDown: tablerIcon(
      `<path d="M6 9l6 6l6 -6"></path>`,
      "icon-tabler-chevron-down",
    ),
    chevronRight: tablerIcon(
      `<path d="M9 6l6 6l-6 6"></path>`,
      "icon-tabler-chevron-right",
    ),
    record: tablerFillIcon(
      `<circle cx="12" cy="12" r="3"></circle>`,
      "icon-tabler-point",
    ),
    stop: tablerIcon(
      `<path d="M5 7a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v10a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2z"></path>`,
      "icon-tabler-player-stop",
    ),
    play: tablerIcon(
      `<path d="M7 4v16l13 -8z"></path>`,
      "icon-tabler-player-play",
    ),
    scan: tablerIcon(
      `<path d="M4 7v-1a2 2 0 0 1 2 -2h2"></path><path d="M4 17v1a2 2 0 0 0 2 2h2"></path><path d="M16 4h2a2 2 0 0 1 2 2v1"></path><path d="M16 20h2a2 2 0 0 0 2 -2v-1"></path><path d="M5 12h14"></path>`,
      "icon-tabler-scan",
    ),
    save: tablerIcon(
      `<path d="M6 4h9l5 5v11a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1v-15a1 1 0 0 1 1 -1"></path><path d="M14 4v4h-6v-4"></path><path d="M8 18h8"></path><path d="M8 14h8v7h-8z"></path>`,
      "icon-tabler-device-floppy",
    ),
    edit: tablerIcon(
      `<path d="M7 20h10"></path><path d="M6 16l0 4l4 0l10 -10a2.828 2.828 0 0 0 -4 -4l-10 10"></path>`,
      "icon-tabler-edit",
    ),
    close: tablerIcon(
      `<path d="M18 6l-12 12"></path><path d="M6 6l12 12"></path>`,
      "icon-tabler-x",
    ),
    check: tablerIcon(
      `<path d="M5 12l5 5l10 -10"></path>`,
      "icon-tabler-check",
    ),
  };
  shadow.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box;margin:0;padding:0}
.app{position:fixed;bottom:16px;right:16px;z-index:2147483647;width:min(480px,94vw);font:12px ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#0f1419;color:#e2e8f0;border:0.5px solid #334155;border-radius:14px;box-shadow:0 12px 40px rgba(2,6,23,.6);overflow:hidden}
.app.collapsed{width:min(260px,92vw)}
.header{background:#111827;border-bottom:0.5px solid #334155;padding:10px 14px;display:flex;align-items:center;justify-content:space-between}
.header-title{font-size:14px;font-weight:500}
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
.app.collapsed .btn-ico{flex:0 0 14px}
.app.collapsed .btn-label{display:none}
.app.collapsed .toolbar{gap:4px}
.app.collapsed .toolbar-spacer{display:none}
.app.collapsed .session-label{display:none}
.app.collapsed button{padding:5px 8px;min-width:28px}
.app.collapsed .stats-bar{display:none}
.app.collapsed .body{display:none}
button{font-family:inherit;cursor:pointer;font-size:12px;border-radius:8px;border:0.5px solid #475569;background:transparent;color:#e2e8f0;padding:5px 12px;transition:background 0.12s}
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
.stat strong{display:block;font-size:16px;font-weight:500;color:#e2e8f0;line-height:1.3}
.stat.danger strong{color:#f87171}
.body{display:flex;height:320px}
.sessions-pane{width:55%;border-right:0.5px solid #334155;display:flex;flex-direction:column}
.pane-header{padding:8px 12px;font-size:11px;font-weight:500;color:#94a3b8;border-bottom:0.5px solid #334155;display:flex;align-items:center;justify-content:space-between;background:#111827;text-transform:uppercase;letter-spacing:0.04em}
.sessions-grid{padding:8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1}
.session-card{background:#111827;border:0.5px solid #334155;border-radius:8px;padding:8px 10px;cursor:pointer;transition:border-color 0.12s}
.session-card:hover{border-color:#475569}
.session-card.active{border-color:rgba(59,130,246,0.5);background:rgba(59,130,246,0.08)}
.session-card.active .session-meta{color:#60a5fa}
.session-top{display:flex;align-items:center;gap:6px}
.session-name{font-size:12px;font-weight:500;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.session-name-input{font-size:12px;font-weight:500;flex:1;border:none;background:transparent;color:#e2e8f0;font-family:inherit;outline:none;border-bottom:1px solid #60a5fa;padding:0}
.session-actions{display:flex;gap:3px;opacity:0;transition:opacity 0.12s}
.session-card:hover .session-actions{opacity:1}
.session-card.active .session-actions{opacity:1}
.session-meta{font-size:10px;color:#64748b;margin-top:5px;display:flex;gap:8px;align-items:center}
.badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;padding:2px 7px;border-radius:20px;font-weight:500}
.badge-blue{background:rgba(59,130,246,0.15);color:#60a5fa}
.badge-gray{background:#1e293b;color:#94a3b8;border:0.5px solid #334155}
.detail-pane{flex:1;display:flex;flex-direction:column}
.active-session-info{padding:10px 12px;border-bottom:0.5px solid #334155;background:#111827}
.progress-bar-wrap{background:#1e293b;border-radius:20px;height:4px;margin-top:6px;overflow:hidden}
.progress-bar-fill{height:4px;border-radius:20px;background:#3b82f6;width:0%;transition:width 0.3s}
.log-area{flex:1;overflow-y:auto;padding:8px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;display:flex;flex-direction:column;gap:3px}
.log-line{padding:4px 8px;border-radius:6px;display:flex;align-items:flex-start;gap:8px;line-height:1.4}
.log-line.done{background:rgba(34,197,94,0.1);color:#4ade80}
.log-line.pending{background:#1e293b;color:#64748b}
.log-line.running{background:rgba(59,130,246,0.15);color:#60a5fa}
.log-line.error{background:rgba(239,68,68,0.1);color:#f87171}
.log-icon{font-size:11px;margin-top:1px;flex-shrink:0}
.empty-state{color:#64748b;font-size:12px;text-align:center;padding:24px 14px;font-family:inherit}
.toolbar-spacer{flex:1}
.session-label{font-size:11px;color:#64748b}
.toolbar-session-label{font-size:11px;color:#64748b;padding:8px 12px;border-bottom:0.5px solid #334155;background:#111827;text-transform:uppercase;letter-spacing:0.04em}
</style>
<div class="app">
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
    <div class="stat"><strong id="toolbox-last-run">—</strong>Last Run</div>
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
          <span style="font-size:12px;font-weight:500" id="toolbox-active-title">—</span>
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

  const countEl = shadow.getElementById("toolbox-count") as HTMLElement;
  const errorsEl = shadow.getElementById("toolbox-errors") as HTMLElement;
  const activeEl = shadow.getElementById("toolbox-active") as HTMLElement;
  const logsEl = shadow.getElementById("toolbox-logs") as HTMLElement;
  const stateEl = shadow.getElementById("toolbox-state") as HTMLElement;
  const collapseToggleBtn = shadow.getElementById(
    "toolbox-collapse-toggle",
  ) as HTMLButtonElement;
  const recordBtn = shadow.getElementById(
    "toolbox-record",
  ) as HTMLButtonElement;
  const stopBtn = shadow.getElementById("toolbox-stop") as HTMLButtonElement;
  const runBtn = shadow.getElementById("toolbox-run") as HTMLButtonElement;
  const scanBtn = shadow.getElementById("toolbox-scan") as HTMLButtonElement;
  const saveBtn = shadow.getElementById("toolbox-save") as HTMLButtonElement;
  const sessionsGrid = shadow.getElementById(
    "toolbox-sessions-grid",
  ) as HTMLElement;
  const sessionsPaneEl = shadow.getElementById(
    "toolbox-sessions-pane",
  ) as HTMLElement;
  const detailPaneEl = shadow.getElementById(
    "toolbox-detail-pane",
  ) as HTMLElement;
  const sessionsCountEl = shadow.getElementById(
    "toolbox-sessions-count",
  ) as HTMLElement;
  const lastRunEl = shadow.getElementById("toolbox-last-run") as HTMLElement;
  const stepCounterEl = shadow.getElementById(
    "toolbox-step-counter",
  ) as HTMLElement;
  const activeInfoEl = shadow.getElementById(
    "toolbox-active-info",
  ) as HTMLElement;
  const activeTitleEl = shadow.getElementById(
    "toolbox-active-title",
  ) as HTMLElement;
  const runningBadgeEl = shadow.getElementById(
    "toolbox-running-badge",
  ) as HTMLElement;
  const progressBarEl = shadow.getElementById(
    "toolbox-progress-bar",
  ) as HTMLElement;
  const newSessionBtn = shadow.getElementById(
    "toolbox-new-session",
  ) as HTMLButtonElement;

  const appEl = shadow.querySelector(".app") as HTMLElement | null;

  const state = {
    recording: false,
    steps: [] as Step[],
    logs: [] as string[],
    errors: 0,
    observer: null as MutationObserver | null,
    timer: 0 as number | null,
    currentSessionId: "",
    lastRecordedAt: 0,
    renamingId: "" as string,
    runningSessionId: "" as string,
    runStep: -1,
    lastRunTime: "" as string,
    collapsed: false,
  };

  const COLLAPSE_KEY = "itskazu-form-filler:toolbox:collapsed:v1";
  const readCollapsed = (): boolean => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  };
  const writeCollapsed = (collapsed: boolean) => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {}
  };

  const applyCollapsedUi = () => {
    if (!appEl) return;
    appEl.classList.toggle("collapsed", state.collapsed);
    collapseToggleBtn.innerHTML = state.collapsed
      ? ICONS.chevronRight
      : ICONS.chevronDown;
    collapseToggleBtn.title = state.collapsed ? "Expand" : "Collapse";
  };

  let elementIds = new WeakMap<Element, string>();
  const getElementId = (el: Element): string => {
    const existing = elementIds.get(el);
    if (existing) return existing;
    const next = `el-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    elementIds.set(el, next);
    return next;
  };

  const log = (msg: string) => {
    state.logs.push(msg);
    logsEl.textContent = state.logs.slice(-12).join("\n");
  };

  const isDynamicId = (id: string) => DYNAMIC_ID_PATTERN.test(id);

  const isSensitiveField = (el: Element): boolean => {
    if (el instanceof HTMLInputElement && el.type.toLowerCase() === "password")
      return true;
    const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
    return (
      ac.includes("cc-") ||
      ac.includes("credit-card") ||
      ac.includes("one-time-code")
    );
  };

  const text = (value: string | null | undefined): string =>
    (value ?? "").trim().replace(/\s+/g, " ");
  const escapeAttrValue = (value: string): string =>
    value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

  const forDisplay = (selector: string): string =>
    selector.replace(/\\([@.:+()])/g, "$1").replace(/\\\s/g, " ");

  const cssPath = (el: Element): string => {
    const segments: string[] = [];
    let node: Element | null = el;
    let depth = 0;
    while (node && node !== document.body && depth < 4) {
      const tag = node.tagName.toLowerCase();
      const parent: HTMLElement | null = node.parentElement;
      if (!parent) break;
      const siblings = Array.from(
        parent.children as HTMLCollectionOf<Element>,
      ).filter((child: Element) => child.tagName === node!.tagName);
      const index = siblings.indexOf(node) + 1;
      segments.unshift(`${tag}:nth-of-type(${Math.max(index, 1)})`);
      node = parent;
      depth += 1;
    }
    return segments.length ? segments.join(" > ") : el.tagName.toLowerCase();
  };

  const elementKey = (el: Element): string => getElementId(el);

  const formKeyOf = (el: Element): string => {
    const form = el instanceof HTMLElement ? el.closest("form") : null;
    if (!form) return "";
    const id = text(form.getAttribute("id"));
    const name = text(form.getAttribute("name"));
    return id || name || cssPath(form);
  };

  const isVisible = (el: Element): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };

  const isInteractableControl = (el: Element): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    if (el.getAttribute("aria-hidden") === "true") return false;
    if (el instanceof HTMLInputElement) {
      if (el.disabled) return false;
      const hiddenByClip = el.tabIndex === -1 && el.type === "radio";
      if (hiddenByClip) return false;
    }
    return true;
  };

  const isNativeFormControl = (el: Element): boolean => {
    return (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      el instanceof HTMLButtonElement
    );
  };

  const isSelectSemanticTarget = (el: Element): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    const role = text(el.getAttribute("role")).toLowerCase();
    const slot = text(el.getAttribute("data-slot")).toLowerCase();
    const popup = text(el.getAttribute("aria-haspopup")).toLowerCase();
    if (role === "option" || role === "combobox" || role === "listbox")
      return true;
    if (popup === "listbox") return true;
    if (slot === "trigger" || slot === "item" || slot.includes("select"))
      return true;
    if (text(el.getAttribute("data-value"))) return true;
    return Boolean(
      el.closest(
        "[role='combobox'],[role='listbox'],[data-slot='trigger'],[data-slot='content'],[data-slot='item'],[data-slot='value'],[data-state]",
      ),
    );
  };

  const isRecordableClickTarget = (el: Element): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    if (!isVisible(el) || !isInteractableControl(el)) return false;
    if (
      el.getAttribute("aria-hidden") === "true" ||
      el.closest("[aria-hidden='true']")
    )
      return false;
    const role = text(el.getAttribute("role")).toLowerCase();
    if (
      role === "presentation" ||
      role === "none" ||
      role === "tablist" ||
      role === "toolbar"
    )
      return false;
    if (isNativeFormControl(el)) return true;
    if (isSelectSemanticTarget(el)) return true;
    if (role === "button") return true;
    return Boolean(el.closest("form"));
  };

  const findLabel = (el: Element): string => {
    if (!(el instanceof HTMLElement)) return "";
    const htmlEl = el as HTMLElement;
    if ("labels" in htmlEl) {
      const labels = (
        htmlEl as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      ).labels;
      if (labels && labels.length > 0) {
        for (const label of Array.from(labels)) {
          const val = text(label.textContent);
          if (val) return val;
        }
      }
    }
    const closest = htmlEl.closest("label");
    const closestText = text(closest?.textContent);
    if (closestText) return closestText;
    return "";
  };

  const buildDisplayName = (el: Element): string => {
    const label = findLabel(el);
    const aria = text(el.getAttribute("aria-label"));
    const placeholder = text(el.getAttribute("placeholder"));
    const name = text(el.getAttribute("name"));
    const tagName = el.tagName.toLowerCase();
    const inputType =
      el instanceof HTMLInputElement ? el.type.toLowerCase() : "";
    const best = label || aria || placeholder || name;
    if (best) return `${best} (${tagName}${inputType ? `[${inputType}]` : ""})`;
    return `${tagName}${inputType ? `[${inputType}]` : ""}`;
  };

  const selectorCandidates = (el: Element): string[] => {
    const selectors: string[] = [];
    const tag = el.tagName.toLowerCase();
    const id = text(el.getAttribute("id"));
    const name = text(el.getAttribute("name"));
    const testId = text(el.getAttribute("data-testid"));
    const aria = text(el.getAttribute("aria-label"));
    const placeholder = text(el.getAttribute("placeholder"));
    const role = text(el.getAttribute("role")).toLowerCase();
    const slot = text(el.getAttribute("data-slot")).toLowerCase();
    const dataValue = text(el.getAttribute("data-value"));
    const type =
      el instanceof HTMLInputElement ? text(el.type.toLowerCase()) : "";
    const isChoice =
      el instanceof HTMLInputElement &&
      (el.type === "radio" || el.type === "checkbox");
    if (testId) selectors.push(`[data-testid="${escapeAttrValue(testId)}"]`);
    if (id && !isDynamicId(id)) selectors.push(`#${CSS.escape(id)}`);
    if (name) selectors.push(`${tag}[name="${escapeAttrValue(name)}"]`);
    if (aria) selectors.push(`${tag}[aria-label="${escapeAttrValue(aria)}"]`);
    if (role) selectors.push(`${tag}[role="${escapeAttrValue(role)}"]`);
    if (role && aria)
      selectors.push(
        `[role="${escapeAttrValue(role)}"][aria-label="${escapeAttrValue(aria)}"]`,
      );
    if (role === "option" && dataValue)
      selectors.push(
        `[role="option"][data-value="${escapeAttrValue(dataValue)}"]`,
      );
    if (slot && dataValue)
      selectors.push(
        `[data-slot="${escapeAttrValue(slot)}"][data-value="${escapeAttrValue(dataValue)}"]`,
      );
    if (dataValue)
      selectors.push(`[data-value="${escapeAttrValue(dataValue)}"]`);
    if (placeholder)
      selectors.push(`${tag}[placeholder="${escapeAttrValue(placeholder)}"]`);
    selectors.push(cssPath(el));
    if (tag === "input" && type)
      selectors.push(
        `input[type="${escapeAttrValue(type)}"]${name ? `[name="${escapeAttrValue(name)}"]` : ""}`,
      );
    if (id && isDynamicId(id)) selectors.push(`${tag}#${CSS.escape(id)}`);
    if (isChoice && id) selectors.push(`label[for="${escapeAttrValue(id)}"]`);
    selectors.push(tag);
    return Array.from(new Set(selectors));
  };

  const primarySelectorOf = (selectors: string[]): string =>
    selectors[0] ?? "*";

  const resolve = (selectors: string[], formKey?: string): Element | null => {
    for (const selector of selectors) {
      try {
        const matched = Array.from(document.querySelectorAll(selector));
        if (matched.length === 0) continue;
        const formMatched = formKey
          ? matched.filter((node) => formKeyOf(node) === formKey)
          : matched;
        const visibleMatched = formMatched.filter((node) => isVisible(node));
        const interactableMatched = visibleMatched.filter((node) =>
          isInteractableControl(node),
        );
        const pick =
          interactableMatched[0] ??
          visibleMatched[0] ??
          formMatched[0] ??
          matched[0] ??
          null;
        if (pick) return pick;
      } catch {}
    }
    return null;
  };

  const parseSessions = (): Session[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Session[];
        return Array.isArray(parsed)
          ? parsed.filter((it) => Array.isArray(it?.steps))
          : [];
      }
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (!legacy) return [];
      const steps = JSON.parse(legacy) as Array<{
        type: string;
        selector: string;
        value?: string;
        checked?: boolean;
      }>;
      if (!Array.isArray(steps) || steps.length === 0) return [];
      const migrated: Session = {
        id: `legacy-${Date.now()}`,
        schemaVersion: "2",
        name: "Migrated session",
        createdAt: new Date().toISOString(),
        url: location.href,
        userAgent: navigator.userAgent,
        steps: steps.map((step, idx) => ({
          type:
            step.type === "check" ||
            step.type === "click" ||
            step.type === "keyboard"
              ? step.type
              : "fill",
          selector: step.selector,
          selectors: [step.selector],
          displayName: step.selector,
          tagName: "field",
          value: step.value,
          checked: step.checked,
          ts: Date.now() + idx,
        })),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([migrated]));
      return [migrated];
    } catch {
      return [];
    }
  };

  const writeSessions = (sessions: Session[]) => {
    const bounded = sessions.slice(0, MAX_SESSIONS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bounded));
  };

  const sessionOptionLabel = (session: Session): string => {
    const at = new Date(session.createdAt).toLocaleTimeString();
    return `${session.name} (${session.steps.length} steps, ${at})`;
  };

  const getSessions = () =>
    parseSessions().sort(
      (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
    );

  const formatLastRun = (dateStr: string): string => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hr ago`;
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
  };

  const renderSessionsGrid = () => {
    const sessions = getSessions();
    sessionsGrid.innerHTML = "";
    sessionsCountEl.textContent = String(sessions.length);

    if (sessions.length === 0) {
      sessionsGrid.innerHTML = `<div class="empty-state">No saved sessions yet</div>`;
      state.currentSessionId = "";
      activeEl.textContent = "No active session";
      renderDetail();
      return;
    }

    if (!sessions.some((it) => it.id === state.currentSessionId)) {
      state.currentSessionId = "";
    }

    for (const session of sessions) {
      const card = document.createElement("div");
      card.className =
        "session-card" +
        (state.currentSessionId === session.id ? " active" : "");
      card.dataset.sessionId = session.id;

      const isRenaming = state.renamingId === session.id;
      const nameEl = isRenaming
        ? `<input class="session-name-input" id="rename-${session.id}" value="${session.name}" />`
        : `<span class="session-name">${session.name}</span>`;

      const lastRunText = formatLastRun(session.createdAt);

      card.innerHTML = `
        <div class="session-top">
          ${nameEl}
          <div class="session-actions">
            <button class="icon-btn" data-action="rename" title="Rename">${ICONS.edit}</button>
            <button class="icon-btn primary" data-action="run" title="Run">${ICONS.play}</button>
            <button class="icon-btn danger-soft" data-action="delete" title="Delete">${ICONS.close}</button>
          </div>
        </div>
        <div class="session-meta">
          <span class="badge badge-blue">${session.steps.length} steps</span>
          <span>Last run: ${lastRunText}</span>
        </div>`;

      card.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("input")) return;
        selectSession(session.id);
      });

      const renameBtn = card.querySelector(
        "[data-action='rename']",
      ) as HTMLButtonElement;
      const runActionBtn = card.querySelector(
        "[data-action='run']",
      ) as HTMLButtonElement;
      const deleteBtn = card.querySelector(
        "[data-action='delete']",
      ) as HTMLButtonElement;

      renameBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        startRename(session.id);
      });

      runActionBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        runSession(session.id);
      });

      deleteBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSession(session.id);
      });

      sessionsGrid.appendChild(card);

      if (isRenaming) {
        setTimeout(() => {
          const inp = shadow.getElementById(
            `rename-${session.id}`,
          ) as HTMLInputElement;
          if (inp) {
            inp.focus();
            inp.select();
            inp.addEventListener("blur", () => commitRename(session.id));
            inp.addEventListener("keydown", (e) => {
              if (e.key === "Enter") commitRename(session.id);
              if (e.key === "Escape") {
                state.renamingId = "";
                renderSessionsGrid();
              }
            });
          }
        }, 10);
      }
    }

    const active = sessions.find((it) => it.id === state.currentSessionId);
    activeEl.textContent = active ? active.name : "No active session";
    renderDetail();
  };

  const selectSession = (id: string) => {
    state.currentSessionId = state.currentSessionId === id ? "" : id;
    renderSessionsGrid();
  };

  const startRename = (id: string) => {
    state.renamingId = id;
    renderSessionsGrid();
  };

  const commitRename = (id: string) => {
    const inp = shadow.getElementById(`rename-${id}`) as HTMLInputElement;
    if (inp) {
      const sessions = getSessions();
      const session = sessions.find((s) => s.id === id);
      if (session) {
        session.name = text(inp.value) || session.name;
        writeSessions(sessions);
      }
    }
    state.renamingId = "";
    renderSessionsGrid();
  };

  const deleteSession = (id: string) => {
    const next = getSessions().filter((it) => it.id !== id);
    writeSessions(next);
    if (state.currentSessionId === id) {
      state.currentSessionId = "";
    }
    renderSessionsGrid();
    log("deleted session");
  };

  const runSession = (id: string) => {
    selectSession(id);
    void replaySession(id);
  };

  const addNewSession = () => {
    const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session: Session = {
      id: newId,
      schemaVersion: "2",
      name: "New session",
      createdAt: new Date().toISOString(),
      url: location.href,
      userAgent: navigator.userAgent,
      steps: [],
    };
    writeSessions([session, ...getSessions()]);
    state.currentSessionId = newId;
    state.renamingId = newId;
    renderSessionsGrid();
  };

  const renderDetail = (runningStep = -1) => {
    const session = getSessions().find((s) => s.id === state.currentSessionId);

    if (!session) {
      detailPaneEl.style.display = "none";
      sessionsPaneEl.style.width = "100%";
      logsEl.innerHTML = `<div class="empty-state">Select a session to see its steps</div>`;
      activeInfoEl.style.display = "none";
      stepCounterEl.textContent = "";
      return;
    }

    detailPaneEl.style.display = "flex";
    sessionsPaneEl.style.width = "55%";
    activeInfoEl.style.display = "block";
    activeTitleEl.textContent = session.name;
    stepCounterEl.textContent = `${session.steps.length} steps`;

    const pct =
      runningStep >= 0
        ? Math.round((runningStep / session.steps.length) * 100)
        : 0;
    progressBarEl.style.width = `${pct}%`;

    runningBadgeEl.style.display =
      state.runningSessionId === session.id ? "inline-flex" : "none";

    logsEl.innerHTML = "";
    if (session.steps.length === 0) {
      logsEl.innerHTML = `<div class="empty-state">No steps recorded yet</div>`;
      return;
    }

    session.steps.forEach((step, i) => {
      const div = document.createElement("div");
      let cls = "pending";
      let icon = ICONS.record;
      if (runningStep < 0) {
        cls = "pending";
        icon = ICONS.record;
      } else if (i < runningStep) {
        cls = "done";
        icon = ICONS.check;
      } else if (i === runningStep) {
        cls = "running";
        icon = ICONS.record;
      }
      div.className = `log-line ${cls}`;
      const displayText = step.displayName || step.selector;
      const targetSelector = forDisplay(
        primarySelectorOf(
          step.selectors?.length ? step.selectors : [step.selector],
        ),
      );
      div.innerHTML = `<span class="log-icon">${icon}</span><span>${displayText} → ${targetSelector}</span>`;
      logsEl.appendChild(div);
    });
  };

  const refreshSessionOptions = () => {
    renderSessionsGrid();
  };

  const saveSession = (name: string, steps: Step[]) => {
    const sanitizedName =
      text(name) || `Session ${new Date().toLocaleString()}`;
    const session: Session = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      schemaVersion: "2",
      name: sanitizedName,
      createdAt: new Date().toISOString(),
      url: location.href,
      userAgent: navigator.userAgent,
      steps,
    };
    try {
      writeSessions([session, ...getSessions()]);
      state.currentSessionId = session.id;
      refreshSessionOptions();
      log(`saved locally: ${sanitizedName}`);
    } catch {
      state.errors += 1;
      errorsEl.textContent = `${state.errors} errors`;
      log("save failed: localStorage quota/restriction");
    }
  };

  const currentSessionSteps = (): Step[] => {
    const session = getSessions().find(
      (it) => it.id === state.currentSessionId,
    );
    return session?.steps ?? [];
  };

  const snapshot = () => {
    const fields = Array.from(
      document.querySelectorAll(
        "input,select,textarea,[contenteditable='true']",
      ),
    ).filter((el) => el instanceof HTMLElement);
    countEl.textContent = String(fields.length);
    errorsEl.textContent = String(state.errors);
  };

  const stopRecording = () => {
    if (!state.recording) return;
    state.recording = false;
    state.observer?.disconnect();
    state.observer = null;
    document.removeEventListener("input", onInput, true);
    document.removeEventListener("change", onChange, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    stateEl.textContent = "Idle";
    stateEl.className = "status-pill status-idle";
    recordBtn.disabled = false;
    stopBtn.disabled = true;
    if (state.steps.length > 0) {
      const autoName = `Session ${new Date().toLocaleString()}`;
      saveSession(autoName, [...state.steps]);
    }
    log(`recording stopped (${state.steps.length} steps)`);
  };

  const pushStep = (next: Step) => {
    const prev = state.steps[state.steps.length - 1];
    const canCoalesce =
      prev &&
      prev.type === "fill" &&
      next.type === "fill" &&
      prev.elementKey &&
      next.elementKey &&
      prev.elementKey === next.elementKey &&
      next.ts - prev.ts < 350;
    if (canCoalesce) {
      prev.value = next.value;
      prev.ts = next.ts;
      return;
    }
    state.steps.push(next);
  };

  const onInput = (event: Event) => {
    if (!state.recording) return;
    const el = event.target;
    if (
      !(
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
    )
      return;
    if (
      el instanceof HTMLInputElement &&
      (el.type === "checkbox" || el.type === "radio")
    )
      return;
    const selectors = selectorCandidates(el);
    const rawValue = "value" in el ? el.value : "";
    const value = rawValue;
    const step: Step = {
      type: "fill",
      selector: primarySelectorOf(selectors),
      selectors,
      displayName: buildDisplayName(el),
      tagName: el.tagName.toLowerCase(),
      inputType:
        el instanceof HTMLInputElement ? el.type.toLowerCase() : undefined,
      value,
      ts: Date.now(),
      elementKey: elementKey(el),
      formKey: formKeyOf(el),
    };
    pushStep(step);
    state.lastRecordedAt = Date.now();
    log(`capture fill: ${step.displayName}`);
  };

  const onChange = (event: Event) => {
    if (!state.recording) return;
    const el = event.target;
    if (el instanceof HTMLSelectElement) {
      const selectors = selectorCandidates(el);
      const selectedOption = el.selectedOptions?.[0];
      const step: Step = {
        type: "fill",
        selector: primarySelectorOf(selectors),
        selectors,
        displayName: buildDisplayName(el),
        tagName: el.tagName.toLowerCase(),
        value: el.value,
        optionText: text(selectedOption?.textContent),
        ts: Date.now(),
        elementKey: elementKey(el),
        formKey: formKeyOf(el),
      };
      pushStep(step);
      state.lastRecordedAt = Date.now();
      log(`capture select: ${step.displayName}=${step.value ?? ""}`);
      return;
    }
    if (
      !(
        el instanceof HTMLInputElement &&
        (el.type === "checkbox" || el.type === "radio")
      )
    )
      return;
    const selectors = selectorCandidates(el);
    const step: Step = {
      type: "check",
      selector: primarySelectorOf(selectors),
      selectors,
      displayName: buildDisplayName(el),
      tagName: el.tagName.toLowerCase(),
      inputType: el.type.toLowerCase(),
      checked: el.checked,
      ts: Date.now(),
      elementKey: elementKey(el),
      formKey: formKeyOf(el),
    };
    pushStep(step);
    state.lastRecordedAt = Date.now();
    log(
      `capture ${el.type.toLowerCase()}: ${step.displayName}=${String(el.checked)}`,
    );
  };

  const onClick = (event: Event) => {
    if (!state.recording) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const interactiveSelector =
      "input,select,textarea,button,a,[role='button'],[role='option'],[role='combobox'],[aria-haspopup='listbox'],[data-slot='trigger'],[data-slot='item'],[data-value]";
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];

    for (const node of path) {
      if (!(node instanceof HTMLElement)) continue;
      const rootNode = node.getRootNode();
      if (
        rootNode === shadow ||
        node.id === "__toolbox-root" ||
        node.closest("#__toolbox-root")
      ) {
        return;
      }
    }

    let clickTargetFromPath: Element | null = null;
    for (const node of path) {
      if (node instanceof Element && node.matches(interactiveSelector)) {
        clickTargetFromPath = node;
        break;
      }
    }
    const clickTarget =
      clickTargetFromPath ?? target.closest(interactiveSelector);
    if (!(clickTarget instanceof Element)) return;
    if (!isRecordableClickTarget(clickTarget)) return;
    const role = clickTarget.getAttribute("role") ?? "";
    const slot = clickTarget.getAttribute("data-slot") ?? "";
    if (
      clickTarget.getAttribute("aria-hidden") === "true" ||
      role === "presentation"
    )
      return;
    if (clickTarget.tagName.toLowerCase() === "div" && !role && !slot) return;
    if (
      clickTarget instanceof HTMLInputElement &&
      (clickTarget.type === "checkbox" || clickTarget.type === "radio")
    )
      return;
    const selectors = selectorCandidates(clickTarget);

    const optionText =
      role === "option" || slot === "item"
        ? text(clickTarget.textContent)
        : undefined;
    const step: Step = {
      type: "click",
      selector: primarySelectorOf(selectors),
      selectors,
      displayName: buildDisplayName(clickTarget),
      tagName: clickTarget.tagName.toLowerCase(),
      ts: Date.now(),
      elementKey: elementKey(clickTarget),
      formKey: formKeyOf(clickTarget),
      optionText,
      role: role || undefined,
    };
    pushStep(step);
    state.lastRecordedAt = Date.now();
    log(`capture click: ${step.displayName}`);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!state.recording) return;
    if (!["Enter", "Tab", "Escape"].includes(event.key)) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const selectors = selectorCandidates(target);
    const step: Step = {
      type: "keyboard",
      selector: primarySelectorOf(selectors),
      selectors,
      displayName: buildDisplayName(target),
      tagName: target.tagName.toLowerCase(),
      value: event.key,
      ts: Date.now(),
      elementKey: elementKey(target),
      formKey: formKeyOf(target),
    };
    pushStep(step);
    state.lastRecordedAt = Date.now();
    log(`capture key: ${event.key} on ${step.displayName}`);
  };

  const startRecording = () => {
    state.recording = true;
    state.steps = [];
    elementIds = new WeakMap<Element, string>();
    stateEl.textContent = "Recording";
    stateEl.className = "status-pill status-recording";
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    state.observer = new MutationObserver(() => {
      if (state.timer) window.clearTimeout(state.timer);
      state.timer = window.setTimeout(snapshot, 100);
    });
    state.observer.observe(document.body, { childList: true, subtree: true });
    log("recording started");
  };

  const replaySession = async (sessionId: string) => {
    const session = getSessions().find((s) => s.id === sessionId);
    if (!session || session.steps.length === 0) {
      log("no steps to run");
      return;
    }

    state.runningSessionId = sessionId;
    state.runStep = 0;
    stateEl.textContent = "Running";
    stateEl.className = "status-pill status-running";
    stopBtn.disabled = false;

    renderDetail(0);

    const steps = session.steps;
    await runStepsWithProgress(steps, sessionId);
  };

  const replay = async () => {
    const savedSteps = currentSessionSteps();
    const hasFreshInMemory =
      state.steps.length > 0 &&
      state.lastRecordedAt > Date.now() - 5 * 60 * 1000;
    const steps = hasFreshInMemory
      ? state.steps
      : savedSteps.length
        ? savedSteps
        : state.steps;
    if (!steps.length) {
      log("no recording to run");
      return;
    }
    log(
      hasFreshInMemory
        ? `run source: current recording (${steps.length} steps)`
        : `run source: saved session (${steps.length} steps)`,
    );

    if (state.currentSessionId) {
      state.runningSessionId = state.currentSessionId;
      state.runStep = 0;
    }

    stateEl.textContent = "Running";
    stateEl.className = "status-pill status-running";
    stopBtn.disabled = false;

    renderDetail(0);
    await runStepsWithProgress(steps);
  };

  const runStepsWithProgress = async (steps: Step[], sessionId = "") => {
    const clickWithPointerEvents = (node: HTMLElement) => {
      node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      node.click();
    };

    const sleep = (ms: number): Promise<void> =>
      new Promise((done) => window.setTimeout(done, ms));

    const reactSelectIndexOfStep = (step: Step): string => {
      const candidates = [step.selector, ...(step.selectors ?? [])];
      for (const selector of candidates) {
        const m = selector.match(/react-select-(\d+)-option-\d+/i);
        if (m?.[1]) return m[1];
      }
      return "";
    };

    const reactSelectOptionIdOfStep = (step: Step): string => {
      const candidates = [step.selector, ...(step.selectors ?? [])];
      for (const selector of candidates) {
        const m = selector.match(/react-select-\d+-option-\d+/i);
        if (m?.[0]) return m[0];
      }
      return "";
    };

    const openReactSelectPopup = (index: string): boolean => {
      if (!index) return false;
      const input = document.getElementById(`react-select-${index}-input`);
      if (input instanceof HTMLElement) {
        input.focus();
        const control = input.closest(
          "[class*='control']",
        ) as HTMLElement | null;
        if (control) {
          clickWithPointerEvents(control);
        } else {
          clickWithPointerEvents(input);
        }
        return true;
      }
      const valueContainer = document.getElementById(
        `react-select-${index}-value`,
      );
      if (valueContainer instanceof HTMLElement) {
        clickWithPointerEvents(valueContainer);
        return true;
      }
      const control = document
        .querySelector(`[id^="react-select-${index}-"][id$="-placeholder"]`)
        ?.closest("[class*='control'],[class*='container']");
      if (control instanceof HTMLElement) {
        clickWithPointerEvents(control);
        return true;
      }
      return false;
    };

    const visiblePopupRoots = (): HTMLElement[] => {
      const roots = Array.from(
        document.querySelectorAll(
          "[role='listbox'],[data-slot='select-content'],[data-radix-select-content],div[data-state='open']",
        ),
      ).filter((node) => node instanceof HTMLElement) as HTMLElement[];
      return roots.filter((node) => isVisible(node));
    };

    const isDisabledOption = (el: HTMLElement): boolean => {
      if (el.getAttribute("aria-disabled") === "true") return true;
      if (el.getAttribute("data-disabled") != null) return true;
      return false;
    };

    const isTopMostAtCenter = (el: HTMLElement): boolean => {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const top = document.elementFromPoint(x, y);
      return Boolean(
        top && (top === el || el.contains(top) || top.contains(el)),
      );
    };

    const findOptionByText = (
      label: string,
      onlyVisible = true,
      reactSelectIndex = "",
    ): HTMLElement | null => {
      const roots = visiblePopupRoots();
      const rootOptions = roots.flatMap((root) =>
        Array.from(
          root.querySelectorAll("[role='option'], [data-slot='item']"),
        ),
      );
      const fallbackOptions = Array.from(
        document.querySelectorAll("[role='option'], [data-slot='item']"),
      );
      const options = (
        rootOptions.length ? rootOptions : fallbackOptions
      ).filter((node) => node instanceof HTMLElement) as HTMLElement[];
      for (const option of options) {
        if (onlyVisible && !isVisible(option)) continue;
        if (isDisabledOption(option)) continue;
        if (reactSelectIndex) {
          const id = option.id ?? "";
          if (id && !id.startsWith(`react-select-${reactSelectIndex}-option-`))
            continue;
        }
        if (text(option.textContent) === label) return option;
      }
      return null;
    };

    const openSelectPopup = (): boolean => {
      const triggerSelector =
        "[role='combobox'],button[aria-haspopup='listbox'],[data-slot='select-trigger'],[data-slot='trigger'][aria-haspopup='listbox'],[data-state][aria-haspopup='listbox']";
      const triggers = Array.from(
        document.querySelectorAll(triggerSelector),
      ).filter((node) => node instanceof HTMLElement) as HTMLElement[];
      const trigger = triggers.find(
        (node) => isVisible(node) && isInteractableControl(node),
      );
      if (!trigger) return false;
      clickWithPointerEvents(trigger);
      return true;
    };

    const optionLooksSelected = (option: HTMLElement): boolean => {
      if (option.getAttribute("aria-selected") === "true") return true;
      const dataState = text(option.getAttribute("data-state")).toLowerCase();
      if (
        dataState === "checked" ||
        dataState === "active" ||
        dataState === "selected"
      )
        return true;
      return option.hasAttribute("data-selected");
    };

    const isReactSelectMenuOpen = (index: string): boolean => {
      if (!index) return false;
      const listbox = document.getElementById(`react-select-${index}-listbox`);
      if (listbox instanceof HTMLElement) return isVisible(listbox);
      const input = document.getElementById(`react-select-${index}-input`);
      if (input instanceof HTMLElement) {
        const expanded = text(
          input.getAttribute("aria-expanded"),
        ).toLowerCase();
        if (expanded === "true") return true;
      }
      return false;
    };

    const findReactSelectOption = (
      step: Step,
      index: string,
      onlyVisible = true,
    ): HTMLElement | null => {
      if (!index) return null;
      const optionId = reactSelectOptionIdOfStep(step);
      if (optionId) {
        const exact = document.getElementById(optionId);
        if (exact instanceof HTMLElement) {
          if ((!onlyVisible || isVisible(exact)) && !isDisabledOption(exact))
            return exact;
        }
      }
      const byText = step.optionText
        ? findOptionByText(step.optionText, onlyVisible, index)
        : null;
      if (byText) return byText;
      return null;
    };

    const clickOptionRobust = async (
      option: HTMLElement,
      reactSelectIndex = "",
    ): Promise<boolean> => {
      const attempts = [0, 30, 60];
      for (const wait of attempts) {
        if (wait) await sleep(wait);
        if (!isVisible(option) || isDisabledOption(option)) continue;
        if (!isTopMostAtCenter(option)) {
          option.scrollIntoView({
            block: "nearest",
            behavior: "instant" as ScrollBehavior,
          });
          await sleep(15);
        }
        clickWithPointerEvents(option);
        await sleep(20);
        for (let i = 0; i < 6; i += 1) {
          await sleep(20);
          if (!option.isConnected) return true;
          if (optionLooksSelected(option)) return true;
          if (reactSelectIndex && !isReactSelectMenuOpen(reactSelectIndex))
            return true;
        }
        if (optionLooksSelected(option)) return true;
        option.click();
        await sleep(30);
        if (optionLooksSelected(option)) return true;
        if (reactSelectIndex && !isReactSelectMenuOpen(reactSelectIndex))
          return true;
      }
      return false;
    };

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      if (sessionId && state.runningSessionId !== sessionId) break;

      const step = steps[stepIndex]!;
      state.runStep = stepIndex;
      renderDetail(stepIndex);

      if (
        step.selector.includes("#toolbox-") ||
        step.selector.includes("#__toolbox-root")
      ) {
        continue;
      }
      if (step.tagName === "div" && !step.role && !step.optionText) {
        continue;
      }
      if (
        step.type === "click" &&
        step.optionText &&
        (step.role === "option" ||
          step.tagName === "li" ||
          step.tagName === "div")
      ) {
        const reactSelectIndex = reactSelectIndexOfStep(step);
        if (reactSelectIndex) {
          let applied = false;
          for (let attempt = 0; attempt < 10; attempt += 1) {
            openReactSelectPopup(reactSelectIndex);
            await sleep(80);
            const optionNode =
              findReactSelectOption(step, reactSelectIndex, true) ??
              findReactSelectOption(step, reactSelectIndex, false);
            if (optionNode) {
              applied = await clickOptionRobust(optionNode, reactSelectIndex);
              if (applied) break;
            }
            await sleep(140);
          }
          if (applied) {
            await sleep(35);
            continue;
          }
          state.errors += 1;
          log(`react-select option unresolved: ${step.optionText}`);
          continue;
        }

        let optionNode = findOptionByText(step.optionText, true, "");
        if (!optionNode && openSelectPopup()) {
          for (let i = 0; i < 6; i += 1) {
            await sleep(40);
            optionNode = findOptionByText(step.optionText, true, "");
            if (optionNode) break;
          }
        }
        if (!optionNode) {
          optionNode = findOptionByText(step.optionText, false, "");
        }
        if (optionNode) {
          const selected = await clickOptionRobust(optionNode);
          if (selected) {
            await sleep(35);
            continue;
          }
        }
      }
      const el = resolve(
        step.selectors?.length ? step.selectors : [step.selector],
        step.formKey,
      );
      if (!(el instanceof HTMLElement)) {
        state.errors += 1;
        log(`missing: ${step.displayName || step.selector}`);
        continue;
      }
      el.scrollIntoView({
        block: "nearest",
        behavior: "instant" as ScrollBehavior,
      });
      if (
        step.type === "fill" &&
        (el instanceof HTMLInputElement ||
          el instanceof HTMLTextAreaElement ||
          el instanceof HTMLSelectElement)
      ) {
        if (isSensitiveField(el) && step.value === "***") {
          log(`skip masked sensitive field: ${step.displayName}`);
          continue;
        }
        if (typeof el.focus === "function") {
          el.focus();
        }
        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : el instanceof HTMLSelectElement
              ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
        const setter =
          "value" in proto
            ? Object.getOwnPropertyDescriptor(proto, "value")?.set
            : undefined;
        setter?.call(el, step.value ?? "");
        if (("value" in el ? el.value : "") !== (step.value ?? ""))
          (
            el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
          ).value = step.value ?? "";
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        if (document.activeElement === el && typeof el.blur === "function") {
          el.blur();
        } else {
          el.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
          el.dispatchEvent(new FocusEvent("blur", { bubbles: false }));
        }
        await sleep(45);
      } else if (step.type === "check" && el instanceof HTMLInputElement) {
        const nextChecked = Boolean(step.checked);
        if (step.inputType === "radio" && !nextChecked) {
          continue;
        }
        if (el.type === "radio") {
          if (!el.checked && nextChecked) el.click();
        } else if (el.type === "checkbox") {
          if (el.checked !== nextChecked) el.click();
        } else {
          el.checked = nextChecked;
        }
        if (el.checked !== nextChecked) el.checked = nextChecked;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      } else if (step.type === "click") {
        if (
          step.optionText &&
          (step.role === "option" ||
            step.tagName === "li" ||
            step.tagName === "div")
        ) {
          const idx = reactSelectIndexOfStep(step);
          const optionNode = idx
            ? findReactSelectOption(step, idx, true)
            : findOptionByText(step.optionText, true, "");
          if (optionNode) {
            const selected = await clickOptionRobust(optionNode, idx);
            if (selected) {
              await sleep(35);
              continue;
            }
          }
        }
        clickWithPointerEvents(el);
      } else if (step.type === "keyboard") {
        el.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: step.value ?? "",
            bubbles: true,
          }),
        );
      }
      await sleep(35);
    }

    state.runningSessionId = "";
    state.runStep = -1;
    state.lastRunTime = new Date().toISOString();
    lastRunEl.textContent = "Just Now";
    stateEl.textContent = "Idle";
    stateEl.className = "status-pill status-idle";
    stopBtn.disabled = true;
    errorsEl.textContent = String(state.errors);
    progressBarEl.style.width = "100%";
    renderDetail(steps.length);
    renderSessionsGrid();
    log(`run complete (${steps.length} steps)`);
  };

  const patchHistory = (key: "pushState" | "replaceState") => {
    const original = history[key];
    history[key] = function (
      this: History,
      ...args: Parameters<History[typeof key]>
    ) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event("toolbox:navigate"));
      return result;
    } as typeof history.pushState;
  };

  const schedule = () => {
    if (state.timer) window.clearTimeout(state.timer);
    state.timer = window.setTimeout(snapshot, 150);
  };

  state.observer = new MutationObserver(schedule);
  state.observer.observe(document.body, { childList: true, subtree: true });
  patchHistory("pushState");
  patchHistory("replaceState");
  window.addEventListener("popstate", snapshot);
  window.addEventListener("hashchange", snapshot);
  window.addEventListener("toolbox:navigate", snapshot);

  recordBtn.addEventListener("click", startRecording);
  stopBtn.addEventListener("click", () => {
    if (state.runningSessionId) {
      state.runningSessionId = "";
      state.runStep = -1;
      stateEl.textContent = "Idle";
      stateEl.className = "status-pill status-idle";
      stopBtn.disabled = true;
      renderDetail(-1);
      log("run stopped");
    } else {
      stopRecording();
    }
  });
  runBtn.addEventListener("click", () => {
    if (state.currentSessionId) {
      runSession(state.currentSessionId);
    } else {
      void replay();
    }
  });
  scanBtn.addEventListener("click", snapshot);
  saveBtn.addEventListener("click", () => {
    if (!state.steps.length) {
      log("nothing to save");
      return;
    }
    const name =
      window.prompt("Session name", `Session ${new Date().toLocaleString()}`) ??
      "";
    saveSession(name, [...state.steps]);
  });
  newSessionBtn.addEventListener("click", addNewSession);

  state.collapsed = readCollapsed();
  applyCollapsedUi();
  collapseToggleBtn.addEventListener("click", () => {
    state.collapsed = !state.collapsed;
    writeCollapsed(state.collapsed);
    applyCollapsedUi();
  });

  renderSessionsGrid();
  snapshot();
}
