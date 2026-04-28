/**
 * Returns WebSocket constructor for browser or Node paths.
 * `ws` imported only on Node path via dynamic import.
 */
export async function getWebSocketCtor(): Promise<typeof WebSocket> {
  if (typeof WebSocket !== "undefined") {
    return WebSocket;
  }

  const { WebSocket: NodeWS } = await import("ws");
  return NodeWS as unknown as typeof WebSocket;
}
