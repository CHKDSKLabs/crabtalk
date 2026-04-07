import WebSocket from "ws";
import type { SignalMessage, PeerInfo } from "./types.js";

const HEARTBEAT_INTERVAL_MS = 30_000;

type MessageHandler = (msg: SignalMessage) => void;
type PeerHandler = (peers: PeerInfo[]) => void;

export class SignalClient {
  private ws: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private onMessage: MessageHandler;
  private onPeersUpdated: PeerHandler;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private signalUrl: string;
  private authToken: string;
  private deviceName: string;

  connected = false;

  constructor(
    signalUrl: string,
    authToken: string,
    deviceName: string,
    onMessage: MessageHandler,
    onPeersUpdated: PeerHandler
  ) {
    this.signalUrl = signalUrl;
    this.authToken = authToken;
    this.deviceName = deviceName;
    this.onMessage = onMessage;
    this.onPeersUpdated = onPeersUpdated;
  }

  connect(): void {
    if (!this.signalUrl) {
      console.error("[CrabTalk] No signal URL configured, skipping connection");
      return;
    }

    const url = this.signalUrl.replace(/^http/, "ws") + "/ws";

    this.ws = new WebSocket(url, {
      headers: {
        authorization: `Bearer ${this.authToken}`,
        "x-device-name": this.deviceName,
      },
    });

    this.ws.on("open", () => {
      this.connected = true;
      console.error(`[CrabTalk] Connected to signal server as ${this.deviceName}`);
      this.startHeartbeat();
    });

    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "peers") {
          this.onPeersUpdated(msg.payload as PeerInfo[]);
        } else {
          this.onMessage(msg as SignalMessage);
        }
      } catch {
        console.error("[CrabTalk] Failed to parse signal message");
      }
    });

    this.ws.on("close", () => {
      this.connected = false;
      this.stopHeartbeat();
      this.scheduleReconnect();
    });

    this.ws.on("error", (err) => {
      console.error("[CrabTalk] Signal connection error:", err.message);
    });
  }

  send(msg: SignalMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      console.error("[CrabTalk] Attempting to reconnect...");
      this.connect();
    }, 5000);
  }
}
