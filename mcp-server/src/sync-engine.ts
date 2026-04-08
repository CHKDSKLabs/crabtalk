import { DaemonClient } from "./daemon-client.js";
import type { CrabTalkConfig, SyncConflict, SyncStatus } from "./types.js";

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
    const res = await this.client.sendCommand({ cmd: "sync-now" });
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
  ): Promise<SyncConflict | undefined> {
    const res = await this.client.sendCommand({
      cmd: "resolve-conflict",
      path,
      resolution,
      content: manualContent,
    });
    return res.conflict ?? undefined;
  }
}
