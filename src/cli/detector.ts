import { readFile } from "fs/promises";
import { join } from "path";
import net from "node:net";

const FRAMEWORK_PORTS: Record<string, number> = {
  vite: 5173,
  "vite-ts": 5173,
  "create-vite": 5173,
  "next": 3000,
  "nuxt": 3000,
  "react-scripts": 3000,
  "webpack-dev-server": 8080,
  "vue-cli": 8080,
  "svelte-kit": 5173,
  "angular-cli": 4200,
  "ember-cli": 4200,
  "parcel": 1234,
  "craco": 3000,
  "icejs": 3333,
  "rsbuild": 3000,
  "modern-js": 3000,
  "umijs": 8000,
  "remix": 3000,
  "redwood": 8910,
  "solid-start": 3000,
  "qwik-city": 5173,
};

const FRAMEWORK_PATTERNS: Record<string, RegExp> = {
  react: /^(react|react-dom|react-dom\/client|next)$/,
  vue: /^(vue|vue-router|nuxt)$/,
  svelte: /^(svelte|svelte\/compiler|svelte-kit)$/,
  angular: /^(?:\@angular\/|@angular)[^/]+$/,
};

export async function detectFrameworks(workspace: string): Promise<string[]> {
  const frameworks = new Set<string>();

  try {
    const packageJsonPath = join(workspace, "package.json");
    const content = await readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    for (const [dep, pattern] of Object.entries(FRAMEWORK_PATTERNS)) {
      for (const depName of Object.keys(allDeps)) {
        if (pattern.test(depName)) {
          frameworks.add(dep);
          break;
        }
      }
    }
  } catch {}

  return Array.from(frameworks);
}

export async function detectDevServerPort(workspace: string): Promise<number | null> {
  try {
    const packageJsonPath = join(workspace, "package.json");
    const content = await readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    const scripts = pkg.scripts || {};

    const devScripts = [scripts.dev, scripts.start, scripts.serve, scripts["dev:server"], scripts.server].filter(Boolean);

    for (const script of devScripts) {
      const portMatch = (script as string).match(/--port[=\s](\d+)|-p\s+(\d+)|PORT[=\s](\d+)/);
      if (portMatch) {
        const matchedPort = portMatch[1] ?? portMatch[2] ?? portMatch[3];
        if (matchedPort) return parseInt(matchedPort, 10);
      }
    }

    for (const [name, value] of Object.entries(scripts)) {
      const scriptValue = value as string;
      for (const [framework, port] of Object.entries(FRAMEWORK_PORTS)) {
        if (new RegExp(`${framework}|dev|start|serve`, "i").test(name)) {
          if (port) return port;
        }
      }
    }

    for (const port of [3000, 4173, 5173, 8080, 8000, 8888]) {
      if (await isPortOpen(port)) return port;
    }
  } catch {}

  return null;
}

async function isPortOpen(port: number): Promise<boolean> {
  return await new Promise((resolve) => {
    const hosts = ["localhost", "127.0.0.1", "::1"];
    let index = 0;
    let socket: net.Socket | null = null;

    const tryNext = (): void => {
      socket?.destroy();
      if (index >= hosts.length) {
        resolve(false);
        return;
      }

      socket = net.createConnection({ host: hosts[index]!, port });
      index += 1;
      socket.setTimeout(350);
      socket.once("connect", () => done(true));
      socket.once("error", tryNext);
      socket.once("timeout", tryNext);
    };

    const done = (value: boolean) => {
      socket?.removeAllListeners();
      socket?.destroy();
      resolve(value);
    };

    tryNext();
  });
}
