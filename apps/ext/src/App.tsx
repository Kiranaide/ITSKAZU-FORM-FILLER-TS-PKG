import {
  applyPlugins,
  type FormScript,
  type KazuFiraHooks,
  Replayer,
  serializeScript,
} from "kazu-fira";
import { useMemo, useState } from "react";
import { mountToolbox } from "./toolbox/mount-toolbox";

const demoScript: FormScript = {
  version: 2,
  id: "ext-demo",
  name: "Ext demo",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  origin: window.location.origin,
  steps: [],
};

export function App() {
  const [status, setStatus] = useState("idle");

  const demoPreview = useMemo(() => serializeScript(demoScript), []);

  const installDemoPlugin = () => {
    const hooks = applyPlugins(
      [
        {
          name: "ext-demo",
          install(runtimeHooks: KazuFiraHooks) {
            runtimeHooks.onReplayStart = () => setStatus("plugin installed");
          },
        },
      ],
      {},
    );

    hooks.onReplayStart?.(demoScript);
  };

  const dryRunReplay = async () => {
    setStatus("replay-ready");
    await new Replayer({
      script: demoScript,
      highlight: false,
    }).play();
    setStatus("replay-finished");
  };

  const injectToolbar = () => {
    mountToolbox();
    setStatus("toolbar-injected");
  };

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Internal extension workspace</p>
        <h1>Kazu Fira Ext</h1>
        <p className="copy">
          This Vite 8 + React 19 app exercises the monorepo boundary by consuming the published core
          API through the workspace package. The toolbar ships through the injected proxy client as
          the single supported runtime path.
        </p>
        <div className="actions">
          <button type="button" className="primary" onClick={injectToolbar}>
            Inject toolbar
          </button>
          <button type="button" onClick={() => void dryRunReplay()}>
            Run replay smoke check
          </button>
          <button type="button" onClick={installDemoPlugin}>
            Install plugin
          </button>
        </div>
        <p className="status">Launch the proxy CLI to load the new toolbar into any target app.</p>
        <p
          className="status"
          style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              display: "inline-block",
              background: status === "idle" ? "var(--text-3)" : "var(--pink)",
            }}
          />
          Status: {status}
        </p>
      </section>

      <div className="actions" style={{ gap: 8 }}>
        <button
          type="button"
          onClick={() => {
            document.querySelectorAll<HTMLElement>("input, select, textarea").forEach((el) => {
              el.style.outline = "2px solid var(--pink)";
              el.style.outlineOffset = "2px";
            });
          }}
        >
          Highlight fields
        </button>
        <button
          type="button"
          onClick={() => {
            document.querySelectorAll<HTMLElement>("input, select, textarea").forEach((el) => {
              el.style.outline = "";
              el.style.outlineOffset = "";
            });
          }}
        >
          Clear highlights
        </button>
      </div>

      <section className="panel">
        <h2>Form playground</h2>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              fontSize: 12,
              color: "var(--text-2)",
            }}
          >
            Email
            <input
              id="demo-email"
              type="email"
              defaultValue="user@example.com"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-1)",
                padding: "6px 8px",
                font: "inherit",
                fontSize: 13,
              }}
            />
          </label>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              fontSize: 12,
              color: "var(--text-2)",
            }}
          >
            Password
            <input
              id="demo-password"
              type="password"
              defaultValue="secret"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-1)",
                padding: "6px 8px",
                font: "inherit",
                fontSize: 13,
              }}
            />
          </label>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              fontSize: 12,
              color: "var(--text-2)",
            }}
          >
            Country
            <select
              id="demo-country"
              defaultValue="us"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-1)",
                padding: "6px 8px",
                font: "inherit",
                fontSize: 13,
              }}
            >
              <option value="us">United States</option>
              <option value="ca">Canada</option>
              <option value="uk">United Kingdom</option>
            </select>
          </label>
          <label
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 3,
              fontSize: 12,
              color: "var(--text-2)",
            }}
          >
            Message
            <textarea
              id="demo-message"
              rows={2}
              defaultValue="Hello world"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text-1)",
                padding: "6px 8px",
                font: "inherit",
                fontSize: 13,
                resize: "vertical",
              }}
            />
          </label>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <input id="demo-terms" type="checkbox" defaultChecked />
          <label htmlFor="demo-terms" style={{ fontSize: 12, color: "var(--text-2)" }}>
            Accept terms
          </label>
        </div>
      </section>

      <section className="panel">
        <h2>Serialized demo script</h2>
        <pre>{demoPreview}</pre>
      </section>
    </main>
  );
}
