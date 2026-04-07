import type { Env } from "./auth.js";
import { createDb } from "./db/index.js";
import { peers } from "./db/schema.js";

export class SignalingRoom implements DurableObject {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const userId = request.headers.get("X-User-Id")!;
    const deviceName = request.headers.get("X-Device-Name")!;

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    // Tags: [userId, deviceName] — used to identify/route messages
    this.state.acceptWebSocket(server, [userId, deviceName]);

    // Record device registration in Neon (best-effort)
    this.upsertPeer(userId, deviceName).catch(() => {});

    this.broadcastPeerList();

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      const msg = JSON.parse(text);
      const targetDevice: string = msg.to;

      for (const socket of this.state.getWebSockets()) {
        const [, sockDevice] = this.state.getTags(socket);
        if (sockDevice === targetDevice) {
          socket.send(JSON.stringify(msg));
          break;
        }
      }
    } catch {
      // Malformed message — drop it
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    ws.close(code, reason);
    this.broadcastPeerList();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    ws.close(1011, "Internal error");
    this.broadcastPeerList();
  }

  private broadcastPeerList(): void {
    const sockets = this.state.getWebSockets();
    const peerList = sockets.map((ws) => {
      const [userId, deviceName] = this.state.getTags(ws);
      return { userId, deviceName, connected: true, lastSeen: Date.now() };
    });

    const msg = JSON.stringify({ type: "peers", payload: peerList });

    for (const ws of sockets) {
      try {
        ws.send(msg);
      } catch {
        // Socket already gone, move on
      }
    }
  }

  private async upsertPeer(userId: string, deviceName: string): Promise<void> {
    const db = createDb(this.env.DATABASE_URL);
    const peerId = `${userId}:${deviceName}`;
    await db
      .insert(peers)
      .values({ id: peerId, userId, deviceName, lastSeen: new Date() })
      .onConflictDoUpdate({ target: peers.id, set: { lastSeen: new Date() } });
  }
}
