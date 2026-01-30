/**
 * WebSocket Server
 *
 * Broadcasts agent session updates to connected frontend clients.
 */
import { WebSocketServer, WebSocket } from "ws";
import { WS_PORT } from "../config.js";
import type { WSUpdate } from "../types.js";

// WebSocket clients by threadId
const wsClientsByThread = new Map<string, Set<WebSocket>>();

// Late-bound reference to getSessionByThread (avoids circular import)
let _getSessionByThread: ((threadId: string) => import("../types.js").AgentSession | undefined) | null = null;

export function setSessionLookup(
  fn: (threadId: string) => import("../types.js").AgentSession | undefined
): void {
  _getSessionByThread = fn;
}

export function broadcastToThread(threadId: string, update: WSUpdate): void {
  const clients = wsClientsByThread.get(threadId);
  if (!clients) return;

  const message = JSON.stringify(update);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

export function createWebSocketServer(): WebSocketServer {
  const wss = new WebSocketServer({ port: WS_PORT });

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url ?? "", `http://localhost:${WS_PORT}`);
    const threadId = url.searchParams.get("threadId");

    if (!threadId) {
      ws.close(1008, "threadId required");
      return;
    }

    console.log(`[WS] Client connected for thread: ${threadId}`);

    if (!wsClientsByThread.has(threadId)) {
      wsClientsByThread.set(threadId, new Set());
    }
    wsClientsByThread.get(threadId)!.add(ws);

    // Send current session state if exists
    const session = _getSessionByThread?.(threadId);
    if (session) {
      ws.send(
        JSON.stringify({
          type: "session_updated",
          sessionId: session.id,
          threadId,
          session: { id: session.id, status: session.status, error: session.error },
        })
      );

      for (const task of session.tasks.values()) {
        ws.send(
          JSON.stringify({
            type: "task_updated",
            sessionId: session.id,
            threadId,
            task,
          })
        );
      }
    }

    ws.on("close", () => {
      console.log(`[WS] Client disconnected for thread: ${threadId}`);
      wsClientsByThread.get(threadId)?.delete(ws);
      if (wsClientsByThread.get(threadId)?.size === 0) {
        wsClientsByThread.delete(threadId);
      }
    });

    ws.on("error", (err) => {
      console.error(`[WS] Error for thread ${threadId}:`, err);
    });
  });

  console.log(`WebSocket server starting on port ${WS_PORT}...`);
  return wss;
}
