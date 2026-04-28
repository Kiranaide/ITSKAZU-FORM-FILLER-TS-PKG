#!/usr/bin/env node

import { parseArgs } from "node:util";
import { detectDevServerPort, detectFrameworks } from "./detector.js";
import { createProxyServer } from "./proxy.js";

interface CliArgs {
  port: string;
  "app-port": string | undefined;
  url: string | undefined;
  workspace: string;
  silent: boolean;
  verbose: boolean;
  help: boolean;
  host: string;
}

function printBanner(): void {
  console.log(
    `
╔═══════════════════════════════════════════╗
║     kazu-fira v1.0.0                      ║
║     Universal Form Recorder & Replayer    ║
╚═══════════════════════════════════════════╝
  `.trim(),
  );
}

function printHelp(): void {
  console.log(
    `
Usage: kazu-fira [options] [app-port]

Proxy Mode (inject into running app):
  [app-port]              Port of your dev app (positional)
  -a, --app-port <port>  Port of your dev app to proxy (required)
  -u, --url <url>        Full URL of your dev app
  -p, --port <port>      Port for toolbar server (default: 3100)
  -w, --workspace <path> Path to your project (default: cwd)
  --host <host>          Host for toolbar script (default: localhost)

Options:
  -s, --silent            Disable interactive prompts
  -v, --verbose           Enable debug logging
  -h, --help              Show this help message

Examples:
  # Proxy to localhost:5173 (Vite default)
  npx kazu-fira 5173
  npx kazu-fira -a 5173

  # Proxy to localhost:3000 (Next.js default)
  npx kazu-fira 3000

  # Custom toolbar port
  npx kazu-fira 5173 -p 4000

  # Custom host (for containers/remote)
  npx kazu-fira 5173 --host 192.168.1.100
  `.trim(),
  );
}

async function runCli(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    options: {
      "app-port": { type: "string", short: "a" },
      url: { type: "string", short: "u" },
      port: { type: "string", short: "p", default: "3100" },
      workspace: { type: "string", short: "w", default: process.cwd() },
      silent: { type: "boolean", short: "s", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
      host: { type: "string", default: "localhost" },
    },
    args,
    allowPositionals: true,
  });

  const options = values as unknown as CliArgs;

  // Support positional argument for app-port
  if (positionals.length > 0 && !options["app-port"]) {
    options["app-port"] = positionals[0] as string;
  }

  if (options.help) {
    printBanner();
    printHelp();
    return;
  }

  printBanner();

  const port = parseInt(options.port as string, 10);
  const workspace = options.workspace;

  let appPort = options["app-port"] ? parseInt(options["app-port"] as string, 10) : null;
  const appUrl = options.url;

  if (!appPort && appUrl) {
    const parsed = new URL(appUrl);
    appPort = parseInt(parsed.port || (parsed.protocol === "https:" ? "443" : "80"), 10);
  }

  if (!appPort) {
    console.log("🔍 Auto-detecting dev server port...");
    const detected = await detectDevServerPort(workspace);
    if (detected) {
      appPort = detected;
      console.log(`✅ Found dev server at port ${appPort}`);
    } else {
      console.log(`
 ❌ Could not auto-detect dev server port

 Please specify manually:
   npx kazu-fira 5173
   npx kazu-fira -a 3000
      `);
      printHelp();
      process.exit(1);
    }
  }

  if (Number.isNaN(appPort) || Number.isNaN(port)) {
    console.error("❌ Error: Port must be a valid number");
    process.exit(1);
  }

  const frameworks = await detectFrameworks(workspace);

  await createProxyServer({
    port,
    appPort,
    workspace,
    silent: options.silent,
    verbose: options.verbose,
    frameworks,
    host: options.host,
  });
}

const cliArgs = process.argv.slice(2);
runCli(cliArgs).catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
