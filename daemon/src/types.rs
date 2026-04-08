use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileManifestEntry {
    pub path: String,
    pub hash: String,
    pub modified_at: u64,
    pub size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "cmd", rename_all = "kebab-case")]
pub enum IpcCommand {
    Status,
    SyncNow,
    GetConflicts,
    ResolveConflict {
        path: String,
        resolution: String,
        content: Option<String>,
    },
    GetManifest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "event", rename_all = "kebab-case")]
pub enum IpcEvent {
    PeerConnected { device: String },
    PeerDisconnected { device: String },
    SyncComplete { synced: u32, conflicts: u32 },
    ConflictDetected { path: String },
    FileReceived { path: String },
}
