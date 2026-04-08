use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::conflicts::ConflictStore;
use crate::types::FileManifestEntry;

#[derive(Debug)]
pub struct DaemonState {
    pub peer_id: String,
    pub listen_addrs: Vec<String>,
    pub connected_peers: Vec<String>,
    pub manifest: HashMap<String, FileManifestEntry>,
    pub conflicts: ConflictStore,
}

impl DaemonState {
    pub fn new() -> Self {
        Self {
            peer_id: String::new(),
            listen_addrs: Vec::new(),
            connected_peers: Vec::new(),
            manifest: HashMap::new(),
            conflicts: ConflictStore::new(),
        }
    }
}

pub type SharedState = Arc<RwLock<DaemonState>>;

pub fn shared_state() -> SharedState {
    Arc::new(RwLock::new(DaemonState::new()))
}
