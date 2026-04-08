import type { Env } from "./auth.js";
import { createDb } from "./db/index.js";
import { peers } from "./db/schema.js";

const STALE_TIMEOUT_MS = 90_000;
const ALARM_INTERVAL_MS = 30_000;
const MESSAGE_TTL_MS = 60_000;

interface BufferedMessage {
  msg: unknown;
  expiresAt: number;
}

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

    this.evictDevice(deviceName);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    this.state.acceptWebSocket(server, [userId, deviceName]);

    await this.state.storage.put(`lastSeen:${deviceName}`, Date.now());

    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm) {
      await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }

    this.upsertPeer(userId, deviceName).catch((err) => {
      console.error(`[CrabTalk] Failed to upsert peer ${userId}:${deviceName}:`, err);
    });

    this.broadcastPeerList();

    await this.flushBufferedMessages(server, deviceName);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);
      const msg = JSON.parse(text);

      const [, senderDevice] = this.state.getTags(ws);
      if (senderDevice) {
        await this.state.storage.put(`lastSeen:${senderDevice}`, Date.now());
      }

      const targetDevice: string = msg.to;
      if (!targetDevice) return;

      let delivered = false;
      for (const socket of this.state.getWebSockets()) {
        const [, sockDevice] = this.state.getTags(socket);
        if (sockDevice === targetDevice) {
          try {
            socket.send(JSON.stringify(msg));
            delivered = true;
          } catch (err) {
            console.error(`[CrabTalk] Failed to relay to ${targetDevice}:`, err);
          }
          break;
        }
      }

      if (!delivered) {
        await this.bufferMessage(targetDevice, msg);
      }

      if (msg.id) {
        try {
          ws.send(JSON.stringify({ type: "ack", id: msg.id, delivered }));
        } catch {
          // Sender socket died between receive and ack
        }
      }
    } catch (err) {
      console.error("[CrabTalk] Failed to process WebSocket message:", err);
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try { ws.close(code, reason); } catch { /* already closed */ }
    const [, deviceName] = this.state.getTags(ws);
    if (deviceName) {
      await this.state.storage.delete(`lastSeen:${deviceName}`);
    }
    this.broadcastPeerList();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    const [, deviceName] = this.state.getTags(ws);
    console.error(`[CrabTalk] WebSocket error for device: ${deviceName ?? "unknown"}`);
    try { ws.close(1011, "Internal error"); } catch { /* already closed */ }
    if (deviceName) {
      await this.state.storage.delete(`lastSeen:${deviceName}`);
    }
    this.broadcastPeerList();
  }

  async alarm(): Promise<void> {
    const now = Date.now();

    for (const ws of this.state.getWebSockets()) {
      const [, deviceName] = this.state.getTags(ws);
      if (!deviceName) continue;

      const lastSeen = await this.state.storage.get<number>(`lastSeen:${deviceName}`);
      if (lastSeen && now - lastSeen > STALE_TIMEOUT_MS) {
        console.error(
          `[CrabTalk] Reaping stale connection: ${deviceName} (idle ${Math.round((now - lastSeen) / 1000)}s)`
        );
        try { ws.close(1000, "Stale connection"); } catch { /* already closed */ }
        await this.state.storage.delete(`lastSeen:${deviceName}`);
      }
    }

    const bufferKeys = await this.state.storage.list<BufferedMessage[]>({ prefix: "buffer:" });
    for (const [key, messages] of bufferKeys) {
      const alive = messages.filter((m) => m.expiresAt > now);
      if (alive.length === 0) {
        await this.state.storage.delete(key);
      } else if (alive.length < messages.length) {
        await this.state.storage.put(key, alive);
      }
    }

    const hasConnections = this.state.getWebSockets().length > 0;
    const hasBuffered = (await this.state.storage.list({ prefix: "buffer:" })).size > 0;
    if (hasConnections || hasBuffered) {
      await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }

  private evictDevice(deviceName: string): void {
    for (const ws of this.state.getWebSockets()) {
      const [, sockDevice] = this.state.getTags(ws);
      if (sockDevice === deviceName) {
        console.error(`[CrabTalk] Evicting duplicate connection: ${deviceName}`);
        try { ws.close(1000, "Superseded by new connection"); } catch { /* already closed */ }
      }
    }
  }

  private async bufferMessage(targetDevice: string, msg: unknown): Promise<void> {
    const key = `buffer:${targetDevice}`;
    const existing = (await this.state.storage.get<BufferedMessage[]>(key)) ?? [];
    existing.push({ msg, expiresAt: Date.now() + MESSAGE_TTL_MS });
    await this.state.storage.put(key, existing);
  }

  private async flushBufferedMessages(ws: WebSocket, deviceName: string): Promise<void> {
    const key = `buffer:${deviceName}`;
    const messages = await this.state.storage.get<BufferedMessage[]>(key);
    if (!messages?.length) return;

    const now = Date.now();
    let flushed = 0;
    for (const { msg, expiresAt } of messages) {
      if (expiresAt > now) {
        try {
          ws.send(JSON.stringify(msg));
          flushed++;
        } catch (err) {
          console.error(`[CrabTalk] Failed to flush buffered message to ${deviceName}:`, err);
          break;
        }
      }
    }

    await this.state.storage.delete(key);
    if (flushed > 0) {
      console.log(`[CrabTalk] Flushed ${flushed} buffered message(s) to ${deviceName}`);
    }
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
      } catch (err) {
        console.error("[CrabTalk] Failed to broadcast peer list:", err);
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
