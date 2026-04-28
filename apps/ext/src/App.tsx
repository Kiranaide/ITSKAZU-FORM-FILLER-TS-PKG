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
          <button type="button" onClick={injectToolbar}>
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
        <p className="status">Status: {status}</p>
      </section>

      <section className="panel">
        <h2>Serialized demo script</h2>
        <pre>{demoPreview}</pre>
      </section>
    </main>
  );
}
