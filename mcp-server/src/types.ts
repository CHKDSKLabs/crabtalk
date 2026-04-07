export interface CrabTalkConfig {
  deviceName: string;
  userId: string;
  signalUrl: string;
  authToken: string;
  syncPaths: string[];
}

export interface FileManifestEntry {
  path: string;
  hash: string;
  modifiedAt: number;
  size: number;
}

export type FileManifest = Map<string, FileManifestEntry>;

export interface SyncConflict {
  path: string;
  localHash: string;
  remoteHash: string;
  localModifiedAt: number;
  remoteModifiedAt: number;
  localDeviceName: string;
  remoteDeviceName: string;
  localContent: string;
  remoteContent: string;
}

export interface PeerInfo {
  deviceName: string;
  userId: string;
  lastSeen: number;
  connected: boolean;
}

export interface SignalMessage {
  type: "offer" | "answer" | "ice-candidate" | "manifest" | "file-request" | "file-data" | "conflict";
  from: string;
  to: string;
  payload: unknown;
}

export interface SyncStatus {
  deviceName: string;
  signalConnected: boolean;
  authValid: boolean;
  peers: PeerInfo[];
  lastSyncTime: number | null;
  pendingLocalChanges: number;
  pendingRemoteChanges: number;
  unresolvedConflicts: number;
  watchedPaths: string[];
}

export const CRAB_SPECIES = [
  "Fiddler",
  "Hermit",
  "Dungeness",
  "King",
  "Spider",
  "Coconut",
  "Horseshoe",
  "Blue",
  "Snow",
  "Stone",
  "Mud",
  "Ghost",
  "Porcelain",
  "Pea",
  "Sally Lightfoot",
  "Japanese Spider",
  "Decorator",
  "Boxing",
  "Yeti",
  "Vampire",
] as const;
