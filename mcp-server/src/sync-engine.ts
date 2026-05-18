import { DaemonClient } from "./daemon-client.js";
import type { CrabTalkConfig, SyncConflict, SyncStatus } from "./types.js";

export interface ResolveConflictResult {
  resolved: boolean;
  remaining?: number;
  conflict?: SyncConflict;
  error?: string;
}

export class SyncEngine {
  private client: DaemonClient;
  private config: CrabTalkConfig;

  constructor(config: CrabTalkConfig) {
    this.config = config;
    this.client = new DaemonClient();
  }

  async start(): Promise<void> {
    await this.client.connect();
  }

  stop(): void {
    this.client.disconnect();
  }

  async getStatus(): Promise<SyncStatus> {
    const res = await this.client.sendCommand({ cmd: "status" });
    return {
      deviceName: res.deviceName ?? this.config.deviceName,
      signalConnected: res.connected ?? false,
      authValid: res.connected ?? false,
      peers: (res.peers ?? []).map((p: string) => ({
        deviceName: p,
        userId: this.config.userId,
        lastSeen: Date.now(),
        connected: true,
      })),
      lastSyncTime: res.lastSyncTime ?? null,
      pendingLocalChanges: res.pendingLocalChanges ?? 0,
      pendingRemoteChanges: res.pendingRemoteChanges ?? 0,
      unresolvedConflicts: res.unresolvedConflicts ?? 0,
      watchedPaths: this.config.syncPaths,
    };
  }

  async syncNow(): Promise<{ synced: number; conflicts: number }> {
    const complete = this.client.waitForEvent((event) => event.event === "sync-complete").catch(() => null);
    const res = await this.client.sendCommand({ cmd: "sync-now" });
    if (res.error) {
      throw new Error(res.error);
    }

    if (res.queued === false || res.connectedPeers === 0) {
      return { synced: 0, conflicts: 0 };
    }

    const event = await complete;
    if (event) {
      return {
        synced: event.synced ?? 0,
        conflicts: event.conflicts ?? 0,
      };
    }

    return {
      synced: res.synced ?? 0,
      conflicts: res.conflicts ?? 0,
    };
  }

  async getConflicts(): Promise<SyncConflict[]> {
    const res = await this.client.sendCommand({ cmd: "get-conflicts" });
    return res.conflicts ?? [];
  }

  async resolveConflict(
    path: string,
    resolution: "local" | "remote" | "manual",
    manualContent?: string
  ): Promise<ResolveConflictResult> {
    const res = await this.client.sendCommand({
      cmd: "resolve-conflict",
      path,
      resolution,
      content: manualContent,
    });
    return res as ResolveConflictResult;
  }
}
