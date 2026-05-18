use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use libp2p::{PeerId, Swarm};
use tokio::sync::broadcast;
use tracing::{info, warn};

use crate::config::CrabTalkConfig;
use crate::conflicts::SyncConflict;
use crate::manifest::diff_manifests;
use crate::network::CrabTalkBehaviour;
use crate::protocol::{
    FileRequest, FileRequestMsg, FileResponseMsg, ManifestDiffResponse, ManifestRequest,
    ManifestResponse,
};
use crate::state::SharedState;
use crate::types::{FileManifestEntry, IpcEvent};

fn safe_claude_path(claude_dir: &Path, path: &str) -> Option<PathBuf> {
    if path.is_empty() || path.contains('\\') {
        return None;
    }

    let relative = Path::new(path);
    let mut clean = PathBuf::new();
    for component in relative.components() {
        match component {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    if clean.as_os_str().is_empty() {
        return None;
    }

    Some(claude_dir.join(clean))
}

pub struct SyncManager {
    pub config: CrabTalkConfig,
    pub claude_dir: PathBuf,
    pub state: SharedState,
    pub event_tx: broadcast::Sender<IpcEvent>,
}

impl SyncManager {
    pub fn new(
        config: CrabTalkConfig,
        claude_dir: PathBuf,
        state: SharedState,
        event_tx: broadcast::Sender<IpcEvent>,
    ) -> Self {
        Self {
            config,
            claude_dir,
            state,
            event_tx,
        }
    }

    pub async fn initiate_sync(&self, swarm: &mut Swarm<CrabTalkBehaviour>, peer_id: PeerId) {
        let manifest_entries: Vec<(String, FileManifestEntry)> = {
            let s = self.state.read().await;
            s.manifest
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect()
        };

        swarm
            .behaviour_mut()
            .manifest_rr
            .send_request(&peer_id, ManifestRequest(manifest_entries));

        info!(%peer_id, "manifest sync initiated");
    }

    pub async fn handle_manifest_request(
        &self,
        entries: Vec<(String, FileManifestEntry)>,
    ) -> ManifestResponse {
        let remote: HashMap<String, FileManifestEntry> = entries.into_iter().collect();

        let local = {
            let s = self.state.read().await;
            s.manifest.clone()
        };

        let diff = diff_manifests(&local, &remote);

        for path in &diff.conflicts {
            self.store_conflict(path, &local, &remote).await;
            let _ = self
                .event_tx
                .send(IpcEvent::ConflictDetected { path: path.clone() });
        }

        let need: Vec<String> = diff
            .remote_only
            .into_iter()
            .chain(diff.remote_newer.into_iter())
            .collect();

        let sending: Vec<String> = diff
            .local_only
            .into_iter()
            .chain(diff.local_newer.into_iter())
            .collect();

        ManifestResponse(ManifestDiffResponse {
            need,
            sending,
            conflicts: diff.conflicts,
        })
    }

    async fn store_conflict(
        &self,
        path: &str,
        local_manifest: &HashMap<String, FileManifestEntry>,
        remote_manifest: &HashMap<String, FileManifestEntry>,
    ) {
        let local_entry = match local_manifest.get(path) {
            Some(e) => e,
            None => return,
        };
        let remote_entry = match remote_manifest.get(path) {
            Some(e) => e,
            None => return,
        };

        let local_content = safe_claude_path(&self.claude_dir, path)
            .and_then(|p| std::fs::read_to_string(p).ok())
            .unwrap_or_default();

        let conflict = SyncConflict {
            path: path.to_string(),
            local_hash: local_entry.hash.clone(),
            remote_hash: remote_entry.hash.clone(),
            local_modified_at: local_entry.modified_at,
            remote_modified_at: remote_entry.modified_at,
            local_device_name: self.config.device_name.clone(),
            remote_device_name: String::new(),
            local_content,
            remote_content: String::new(),
        };

        let mut s = self.state.write().await;
        s.conflicts.add(conflict);
    }

    pub async fn handle_manifest_response(
        &self,
        peer_id: PeerId,
        response: ManifestDiffResponse,
        swarm: &mut Swarm<CrabTalkBehaviour>,
    ) {
        for path in &response.conflicts {
            info!(%peer_id, %path, "sync conflict detected");

            let local_manifest = {
                let s = self.state.read().await;
                s.manifest.clone()
            };

            if let Some(local_entry) = local_manifest.get(path) {
                let local_content = safe_claude_path(&self.claude_dir, path)
                    .and_then(|p| std::fs::read_to_string(p).ok())
                    .unwrap_or_default();

                let conflict = SyncConflict {
                    path: path.clone(),
                    local_hash: local_entry.hash.clone(),
                    remote_hash: String::new(),
                    local_modified_at: local_entry.modified_at,
                    remote_modified_at: 0,
                    local_device_name: self.config.device_name.clone(),
                    remote_device_name: String::new(),
                    local_content,
                    remote_content: String::new(),
                };

                let mut s = self.state.write().await;
                s.conflicts.add(conflict);
            }

            let _ = self
                .event_tx
                .send(IpcEvent::ConflictDetected { path: path.clone() });
        }

        // response.sending = files the peer has that we need. Conflicted paths are
        // requested too so the conflict UI can show remote content.
        for path in response.sending.iter().chain(response.conflicts.iter()) {
            swarm
                .behaviour_mut()
                .file_rr
                .send_request(&peer_id, FileRequestMsg(FileRequest { path: path.clone() }));
        }

        // response.need = files the peer needs from us; the peer requests those
        // immediately after it sends the manifest response.
    }

    pub async fn handle_file_request(&self, path: &str) -> Option<FileResponseMsg> {
        let full_path = safe_claude_path(&self.claude_dir, path)?;
        let content = tokio::fs::read(&full_path).await.ok()?;

        let entry = {
            let s = self.state.read().await;
            s.manifest.get(path).cloned()
        }?;

        Some(FileResponseMsg { entry, content })
    }

    pub async fn handle_file_response(
        &self,
        path: &str,
        entry: FileManifestEntry,
        content: Vec<u8>,
    ) {
        let is_conflicted = {
            let s = self.state.read().await;
            s.conflicts.list(Some(path)).len() > 0
        };

        if is_conflicted {
            let remote_content = String::from_utf8_lossy(&content).into_owned();
            let mut s = self.state.write().await;
            s.conflicts.update_remote_content(path, remote_content);
            info!(%path, "file transfer received for conflicted path — stored as remote_content, not written");
            return;
        }

        let full_path = match safe_claude_path(&self.claude_dir, path) {
            Some(p) => p,
            None => {
                warn!(%path, "refusing to write unsafe sync path");
                return;
            }
        };

        if let Some(parent) = full_path.parent() {
            if let Err(e) = tokio::fs::create_dir_all(parent).await {
                warn!(%path, "failed to create parent directories: {e}");
                return;
            }
        }

        if let Err(e) = tokio::fs::write(&full_path, &content).await {
            warn!(%path, "failed to write received file: {e}");
            return;
        }

        {
            let mut s = self.state.write().await;
            s.manifest.insert(path.to_string(), entry);
        }

        info!(%path, "file received and written");
        let _ = self.event_tx.send(IpcEvent::FileReceived {
            path: path.to_string(),
        });
    }

    pub async fn finish_sync(&self, synced: u32, conflicts: u32) {
        {
            let mut s = self.state.write().await;
            s.last_sync_time = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .ok()
                .map(|d| d.as_millis() as u64);
        }
        let _ = self
            .event_tx
            .send(IpcEvent::SyncComplete { synced, conflicts });
    }
}
