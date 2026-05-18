import { createConnection, Socket } from "net";
import { join } from "path";
import { homedir } from "os";

const PIPE_PATH = "\\\\.\\pipe\\crabtalk-daemon";
const SOCK_PATH = join(homedir(), ".claude", "crabtalk.sock");
const COMMAND_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

interface PendingCommand {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingEvent {
  predicate: (event: any) => boolean;
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DaemonClient {
  private socket: Socket | null = null;
  private buffer = "";
  private pending = new Map<string, PendingCommand>();
  private pendingEvents = new Set<PendingEvent>();
  private eventCallbacks: Array<(event: any) => void> = [];
  private connected = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socketPath = process.platform === "win32" ? PIPE_PATH : SOCK_PATH;
      const sock = createConnection({ path: socketPath });

      sock.once("connect", () => {
        this.socket = sock;
        this.connected = true;
        this.reconnectAttempt = 0;
        this.attachHandlers(sock);
        resolve();
      });

      sock.once("error", (err) => {
        if (!this.connected) {
          reject(err);
        }
      });
    });
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
    this.rejectAllPending(new Error("Disconnected."));
    this.rejectAllPendingEvents(new Error("Disconnected."));
  }

  async sendCommand(cmd: object): Promise<any> {
    if (!this.connected || !this.socket) {
      throw new Error("Daemon is not running. Start crabtalk-daemon first.");
    }

    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Command timed out after ${COMMAND_TIMEOUT_MS}ms: ${JSON.stringify(cmd)}`));
      }, COMMAND_TIMEOUT_MS);

      this.pending.set(requestId, { resolve, reject, timer });
      this.socket!.write(JSON.stringify({ requestId, ...cmd }) + "\n");
    });
  }

  async waitForEvent(
    predicate: (event: any) => boolean,
    timeoutMs = COMMAND_TIMEOUT_MS
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const pending: PendingEvent = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.pendingEvents.delete(pending);
          reject(new Error(`Timed out waiting for daemon event after ${timeoutMs}ms.`));
        }, timeoutMs),
      };
      this.pendingEvents.add(pending);
    });
  }

  onEvent(callback: (event: any) => void): void {
    this.eventCallbacks.push(callback);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private attachHandlers(sock: Socket): void {
    sock.on("data", (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          this.dispatch(JSON.parse(trimmed));
        } catch {
          console.error("[CrabTalk] Unparseable daemon message:", trimmed);
        }
      }
    });

    sock.on("close", () => {
      this.connected = false;
      this.socket = null;
      this.rejectAllPending(new Error("Daemon connection closed unexpectedly."));
      this.rejectAllPendingEvents(new Error("Daemon connection closed unexpectedly."));
      if (!this.destroyed) this.scheduleReconnect();
    });

    sock.on("error", (err) => {
      console.error("[CrabTalk] Daemon socket error:", err.message);
    });
  }

  private dispatch(msg: any): void {
    if (msg.requestId && this.pending.has(msg.requestId)) {
      const entry = this.pending.get(msg.requestId)!;
      clearTimeout(entry.timer);
      this.pending.delete(msg.requestId);
      entry.resolve("result" in msg ? msg.result : msg);
    } else if (msg.event) {
      for (const pending of Array.from(this.pendingEvents)) {
        if (pending.predicate(msg)) {
          clearTimeout(pending.timer);
          this.pendingEvents.delete(pending);
          pending.resolve(msg);
        }
      }

      for (const cb of this.eventCallbacks) {
        try {
          cb(msg);
        } catch (err) {
          console.error("[CrabTalk] Event callback threw:", err);
        }
      }
    }
  }

  private rejectAllPendingEvents(err: Error): void {
    for (const entry of this.pendingEvents) {
      clearTimeout(entry.timer);
      entry.reject(err);
      this.pendingEvents.delete(entry);
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(err);
      this.pending.delete(id);
    }
  }

  private scheduleReconnect(): void {
    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempt), MAX_BACKOFF_MS);
    this.reconnectAttempt++;

    console.error(`[CrabTalk] Reconnecting to daemon in ${backoff}ms (attempt ${this.reconnectAttempt})...`);

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
        console.error("[CrabTalk] Reconnected to daemon.");
      } catch {
        this.scheduleReconnect();
      }
    }, backoff);
  }
}
