import { EventBus } from "./event-bus.js";
import type { ToolboxMessage, ToolboxMessageType } from "./messages.js";

type WsEvents = {
  connected: undefined;
  disconnected: undefined;
  message: ToolboxMessage;
};

export class WsClient {
  private socket: WebSocket | null = null;
  private retries = 0;
  readonly bus = new EventBus<WsEvents>();

  constructor(private readonly url: string) {}

  connect(): void {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("open", () => {
      this.retries = 0;
      this.bus.emit("connected", undefined);
    });
    this.socket.addEventListener("close", () => {
      this.bus.emit("disconnected", undefined);
      this.scheduleReconnect();
    });
    this.socket.addEventListener("message", (event) => {
      try {
        this.bus.emit("message", JSON.parse(String(event.data)) as ToolboxMessage);
      } catch {}
    });
  }

  on<K extends keyof WsEvents>(type: K, handler: (payload: WsEvents[K]) => void): () => void {
    return this.bus.on(type, handler);
  }

  send<T>(type: ToolboxMessageType, payload: T): void {
    this.socket?.send(
      JSON.stringify({ type, payload, ts: Date.now() } satisfies ToolboxMessage<T>),
    );
  }

  private scheduleReconnect(): void {
    if (this.retries >= 5) return;
    const delay = Math.min(1000 * 2 ** this.retries++, 8000);
    window.setTimeout(() => this.connect(), delay);
  }
}
