import { WebSocketServer, WebSocket } from "ws";
import { eq, and } from "drizzle-orm";
import { db } from "./db/index.js";
import { peers } from "./db/schema.js";
import { auth } from "./auth.js";
import type { IncomingMessage } from "http";
import type { Server } from "http";

interface ConnectedPeer {
  ws: WebSocket;
  userId: string;
  deviceName: string;
}

const connectedPeers = new Map<string, ConnectedPeer>();

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", async (ws: WebSocket, req: IncomingMessage) => {
    const authHeader = req.headers.authorization;
    const deviceName = req.headers["x-device-name"] as string;

    if (!authHeader || !deviceName) {
      ws.close(4001, "Missing auth or device name");
      return;
    }

    const token = authHeader.replace("Bearer ", "");

    let userId: string;
    try {
      const session = await auth.api.getSession({
        headers: new Headers({ authorization: `Bearer ${token}` }),
      });
      if (!session?.user?.id) {
        ws.close(4001, "Invalid session");
        return;
      }
      userId = session.user.id;
    } catch {
      ws.close(4001, "Auth failed");
      return;
    }

    // Register peer in DB
    const peerId = `${userId}:${deviceName}`;
    await db
      .insert(peers)
      .values({
        id: peerId,
        userId,
        deviceName,
        lastSeen: new Date(),
      })
      .onConflictDoUpdate({
        target: peers.id,
        set: { lastSeen: new Date() },
      });

    connectedPeers.set(peerId, { ws, userId, deviceName });

    // Notify all peers of this user about the updated peer list
    broadcastPeerList(userId);

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        const targetPeerId = `${userId}:${msg.to}`;
        const targetPeer = connectedPeers.get(targetPeerId);

        if (targetPeer && targetPeer.ws.readyState === WebSocket.OPEN) {
          targetPeer.ws.send(JSON.stringify(msg));
        }
      } catch {
        // Malformed message, ignore
      }
    });

    ws.on("pong", () => {
      db.update(peers)
        .set({ lastSeen: new Date() })
        .where(eq(peers.id, peerId))
        .catch(() => {});
    });

    ws.on("close", () => {
      connectedPeers.delete(peerId);
      broadcastPeerList(userId);
    });
  });

  // Heartbeat: detect dead connections
  setInterval(() => {
    for (const [id, peer] of connectedPeers) {
      if (peer.ws.readyState !== WebSocket.OPEN) {
        connectedPeers.delete(id);
        broadcastPeerList(peer.userId);
        continue;
      }
      peer.ws.ping();
    }
  }, 30_000);
}

function broadcastPeerList(userId: string): void {
  const userPeers = Array.from(connectedPeers.values())
    .filter((p) => p.userId === userId)
    .map((p) => ({
      deviceName: p.deviceName,
      userId: p.userId,
      lastSeen: Date.now(),
      connected: true,
    }));

  const msg = JSON.stringify({ type: "peers", payload: userPeers });

  for (const peer of connectedPeers.values()) {
    if (peer.userId === userId && peer.ws.readyState === WebSocket.OPEN) {
      peer.ws.send(msg);
    }
  }
}
