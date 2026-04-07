import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { homedir } from "os";
import { buildManifest, diffManifests } from "./manifest.js";
import { FileWatcher } from "./watcher.js";
import { SignalClient } from "./signaling.js";
import { PeerConnection_ } from "./peer.js";
import type {
  CrabTalkConfig,
  FileManifest,
  FileManifestEntry,
  PeerInfo,
  SignalMessage,
  SyncConflict,
  SyncStatus,
} from "./types.js";

export class SyncEngine {
  private config: CrabTalkConfig;
  private claudeDir: string;
  private watcher: FileWatcher;
  private signal: SignalClient;
  private peers = new Map<string, PeerConnection_>();
  private peerInfo: PeerInfo[] = [];
  private localManifest: FileManifest = new Map();
  private conflicts: SyncConflict[] = [];
  private lastSyncTime: number | null = null;
  private pendingRemoteChanges = 0;
  private authValid: boolean = false;

  constructor(config: CrabTalkConfig) {
    this.config = config;
    this.claudeDir = join(homedir(), ".claude");

    this.watcher = new FileWatcher((changedPaths) => {
      this.onLocalChanges(changedPaths);
    });

    this.signal = new SignalClient(
      config.signalUrl,
      config.authToken,
      config.deviceName,
      (msg) => this.onSignalMessage(msg),
      (peers) => this.onPeersUpdated(peers)
    );
  }

  async start(): Promise<void> {
    this.localManifest = await buildManifest(this.claudeDir, this.config.syncPaths);
    this.watcher.start(this.claudeDir, this.config.syncPaths);
    this.authValid = await this.validateAuth();
    this.signal.connect();
  }

  stop(): void {
    this.watcher.stop();
    this.signal.disconnect();
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
  }

  getStatus(): SyncStatus {
    return {
      deviceName: this.config.deviceName,
      signalConnected: this.signal.connected,
      authValid: this.authValid,
      peers: this.peerInfo,
      lastSyncTime: this.lastSyncTime,
      pendingLocalChanges: 0,
      pendingRemoteChanges: this.pendingRemoteChanges,
      unresolvedConflicts: this.conflicts.length,
      watchedPaths: this.config.syncPaths,
    };
  }

  getConflicts(): SyncConflict[] {
    return this.conflicts;
  }

  resolveConflict(
    path: string,
    resolution: "local" | "remote" | "manual",
    manualContent?: string
  ): SyncConflict | undefined {
    const idx = this.conflicts.findIndex((c) => c.path === path);
    if (idx === -1) return undefined;

    const conflict = this.conflicts[idx];
    this.conflicts.splice(idx, 1);

    if (resolution === "remote") {
      this.writeFileFromRemote(path, Buffer.from(conflict.remoteContent, "utf-8"));
    } else if (resolution === "manual" && manualContent) {
      this.writeFileFromRemote(path, Buffer.from(manualContent, "utf-8"));
    }
    // "local" = do nothing, local version already on disk

    return conflict;
  }

  async syncNow(): Promise<{ synced: number; conflicts: number }> {
    this.localManifest = await buildManifest(this.claudeDir, this.config.syncPaths);

    for (const peer of this.peers.values()) {
      if (peer.connected) {
        peer.sendManifest(this.localManifest);
      }
    }

    return {
      synced: this.localManifest.size,
      conflicts: this.conflicts.length,
    };
  }

  private async validateAuth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.signalUrl}/api/auth/get-session`, {
        headers: { Authorization: `Bearer ${this.config.authToken}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async onLocalChanges(_changedPaths: string[]): Promise<void> {
    this.localManifest = await buildManifest(this.claudeDir, this.config.syncPaths);

    for (const peer of this.peers.values()) {
      if (peer.connected) {
        peer.sendManifest(this.localManifest);
      }
    }
  }

  private onSignalMessage(msg: SignalMessage): void {
    const peerName = msg.from;

    if (!this.peers.has(peerName)) {
      this.createPeerConnection(peerName, false);
    }

    const peer = this.peers.get(peerName);
    peer?.handleSignal(msg);
  }

  private onPeersUpdated(peers: PeerInfo[]): void {
    this.peerInfo = peers;

    for (const peer of peers) {
      if (peer.deviceName !== this.config.deviceName && !this.peers.has(peer.deviceName)) {
        // Deterministic initiator: higher device name wins, preventing both sides from offering
        const initiator = this.config.deviceName > peer.deviceName;
        this.createPeerConnection(peer.deviceName, initiator);
      }
    }
  }

  private async createPeerConnection(remoteDeviceName: string, initiator: boolean): Promise<void> {
    const peer = new PeerConnection_(
      this.config.deviceName,
      remoteDeviceName,
      (msg) => this.signal.send(msg),
      (path, content, entry) => this.onFileReceived(path, content, entry, remoteDeviceName),
      (manifest) => this.onRemoteManifest(manifest, remoteDeviceName),
      () => this.onPeerConnected(remoteDeviceName)
    );

    this.peers.set(remoteDeviceName, peer);

    if (initiator) {
      await peer.createOffer();
    }
  }

  private async onPeerConnected(remoteDeviceName: string): Promise<void> {
    const peer = this.peers.get(remoteDeviceName);
    if (!peer) return;
    this.localManifest = await buildManifest(this.claudeDir, this.config.syncPaths);
    peer.sendManifest(this.localManifest);
  }

  private async onRemoteManifest(
    remoteManifest: FileManifest,
    remoteDeviceName: string
  ): Promise<void> {
    const diff = diffManifests(this.localManifest, remoteManifest);
    const peer = this.peers.get(remoteDeviceName);
    if (!peer) return;

    // Send files we have that remote doesn't
    for (const path of diff.localOnly) {
      await this.sendFileToPeer(peer, path);
    }

    // Send files where local is newer
    for (const path of diff.localNewer) {
      await this.sendFileToPeer(peer, path);
    }

    // Track files we need from remote
    this.pendingRemoteChanges = diff.remoteOnly.length + diff.remoteNewer.length;

    // Flag conflicts
    for (const path of diff.conflicts) {
      const localEntry = this.localManifest.get(path)!;
      const remoteEntry = remoteManifest.get(path)!;
      const localContent = await readFile(join(this.claudeDir, path), "utf-8");

      this.conflicts.push({
        path,
        localHash: localEntry.hash,
        remoteHash: remoteEntry.hash,
        localModifiedAt: localEntry.modifiedAt,
        remoteModifiedAt: remoteEntry.modifiedAt,
        localDeviceName: this.config.deviceName,
        remoteDeviceName,
        localContent,
        remoteContent: "", // filled when remote sends the file
      });
    }

    this.lastSyncTime = Date.now();
  }

  private async sendFileToPeer(peer: PeerConnection_, path: string): Promise<void> {
    try {
      const fullPath = join(this.claudeDir, path);
      const content = await readFile(fullPath);
      const entry = this.localManifest.get(path)!;
      peer.sendFile(path, content, entry);
    } catch {
      console.error(`[CrabTalk] Failed to send file: ${path}`);
    }
  }

  private async onFileReceived(
    path: string,
    content: Buffer,
    entry: FileManifestEntry,
    remoteDeviceName: string
  ): Promise<void> {
    // Check if this file is a known conflict
    const conflictIdx = this.conflicts.findIndex(
      (c) => c.path === path && c.remoteDeviceName === remoteDeviceName
    );

    if (conflictIdx !== -1) {
      this.conflicts[conflictIdx].remoteContent = content.toString("utf-8");
      return; // Don't write — user must resolve
    }

    await this.writeFileFromRemote(path, content);
    this.localManifest.set(path, entry);
    this.pendingRemoteChanges = Math.max(0, this.pendingRemoteChanges - 1);
  }

  private async writeFileFromRemote(path: string, content: Buffer): Promise<void> {
    const fullPath = join(this.claudeDir, path);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }
}
