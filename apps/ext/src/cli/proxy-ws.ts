import fs from "node:fs/promises";
import type http from "node:http";
import path from "node:path";
import type { ToolboxMessage } from "./messages.js";
import { TOOLBOX_WS_PATH } from "./paths.js";

type WsLike = {
  on(event: "close" | "message", handler: (...args: unknown[]) => void): void;
  send(data: string): void;
};

const clients = new Set<WsLike>();

export async function attachToolboxWs(server: http.Server, workspace: string): Promise<void> {
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== TOOLBOX_WS_PATH) return;
    wss.handleUpgrade(req, socket, head, (ws) => {
      clients.add(ws);
      ws.on("close", () => clients.delete(ws));
      ws.on("message", async (raw: string | Buffer | ArrayBuffer | Buffer[]) => {
        const msg = JSON.parse(
          Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw),
        ) as ToolboxMessage;
        if (msg.type === "recording:save") {
          const dir = path.join(workspace, ".toolbox", "recordings");
          await fs.mkdir(dir, { recursive: true });
          const payload = msg.payload as { name: string; data: unknown };
          const filePath = path.join(dir, `${payload.name}.json`);
          await fs.writeFile(filePath, JSON.stringify(payload.data, null, 2), "utf8");
          broadcast({ type: "recording:saved", payload: { filePath }, ts: Date.now() });
        }
        if (msg.type === "log:entry") broadcast(msg);
      });
    });
  });
}

export function broadcast(message: ToolboxMessage): void {
  const raw = JSON.stringify(message);
  for (const client of clients) client.send(raw);
}
