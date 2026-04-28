import http from "node:http";
import https from "node:https";
import net from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { brotliDecompress, gunzip, inflate } from "node:zlib";
import { build } from "vite";
import { injectToolbar } from "./injector.js";
import { TOOLBOX_CLIENT_PATH, TOOLBOX_WS_PATH } from "./paths.js";
import { attachToolboxWs } from "./proxy-ws.js";
import type { CliOptions } from "./types.js";

const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
const brotliAsync = promisify(brotliDecompress);

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const TOOLBOX_ENTRY = resolve(CURRENT_DIR, "client.ts");
const CORE_ENTRY = resolve(CURRENT_DIR, "../../../../packages/core/src/index.ts");

let toolboxBundlePromise: Promise<string> | null = null;

type BuildOutput = {
  output: Array<{ type: "chunk"; code: string } | { type: "asset" }>;
};

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

    if (req.url === TOOLBOX_CLIENT_PATH) {
      try {
        const bundle = await loadToolboxBundle();
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.end(bundle);
      } catch (error) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(`Toolbox bundle error: ${(error as Error).message}`);
      }
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

  await attachToolboxWs(server, workspace);

  server.on("upgrade", (req, socket, head) => {
    if (!req.url || req.url === TOOLBOX_WS_PATH) return;
    const upstreamSocket = net.createConnection({ host: upstreamHost, port: appPort }, () => {
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
          .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`),
        "",
        "",
      ];
      upstreamSocket.write(headers.join("\r\n"));
      if (head.length > 0) upstreamSocket.write(head);
      socket.pipe(upstreamSocket).pipe(socket);
    });
    upstreamSocket.on("error", () => socket.destroy());
  });

  await new Promise<void>((resolvePromise) => server.listen(port, resolvePromise));
}

async function loadToolboxBundle(): Promise<string> {
  if (!toolboxBundlePromise) {
    toolboxBundlePromise = buildToolboxBundle().catch((error) => {
      toolboxBundlePromise = null;
      throw error;
    });
  }
  return toolboxBundlePromise;
}

async function buildToolboxBundle(): Promise<string> {
  const result = (await build({
    configFile: false,
    logLevel: "error",
    resolve: {
      alias: {
        "kazu-fira": CORE_ENTRY,
      },
    },
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      sourcemap: false,
      rollupOptions: {
        input: TOOLBOX_ENTRY,
        output: {
          format: "es",
          inlineDynamicImports: true,
          entryFileNames: "toolbox-client.js",
        },
      },
    },
  })) as BuildOutput | BuildOutput[];

  const outputs = Array.isArray(result) ? result : [result];
  for (const output of outputs) {
    const chunk = output.output.find((item) => item.type === "chunk");
    if (chunk?.type === "chunk") return chunk.code;
  }

  throw new Error("Failed to generate toolbox bundle");
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

  const proxyReq = client.request(target, { method: req.method, headers }, async (proxyRes) => {
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
      toolbarPath: TOOLBOX_CLIENT_PATH,
    });
    const payload = Buffer.from(injected, "utf8");
    delete responseHeaders["content-encoding"];
    delete responseHeaders["content-length"];
    delete responseHeaders["x-frame-options"];
    delete responseHeaders["content-security-policy"];
    responseHeaders["content-length"] = String(payload.byteLength);
    writeHead(res, proxyRes.statusCode ?? 200, responseHeaders);
    res.end(payload);
  });

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

function normalizeHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(", ") : value;
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
  if (encoding.includes("deflate")) return Buffer.from(await inflateAsync(body));
  return body;
}
