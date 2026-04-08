use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConflict {
    pub path: String,
    pub local_hash: String,
    pub remote_hash: String,
    pub local_modified_at: u64,
    pub remote_modified_at: u64,
    pub local_device_name: String,
    pub remote_device_name: String,
    pub local_content: String,
    pub remote_content: String,
}

#[derive(Debug, Default)]
pub struct ConflictStore {
    conflicts: Vec<SyncConflict>,
}

impl ConflictStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add(&mut self, conflict: SyncConflict) {
        if let Some(existing) = self.conflicts.iter_mut().find(|c| c.path == conflict.path) {
            *existing = conflict;
        } else {
            self.conflicts.push(conflict);
        }
    }

    pub fn list(&self, path_filter: Option<&str>) -> Vec<&SyncConflict> {
        match path_filter {
            Some(filter) => self.conflicts.iter().filter(|c| c.path == filter).collect(),
            None => self.conflicts.iter().collect(),
        }
    }

    pub fn resolve(
        &mut self,
        path: &str,
        resolution: &str,
        manual_content: Option<&str>,
        claude_dir: &Path,
    ) -> Option<SyncConflict> {
        let pos = self.conflicts.iter().position(|c| c.path == path)?;
        let conflict = self.conflicts.remove(pos);

        let full_path = claude_dir.join(path);

        match resolution {
            "remote" => {
                if let Some(parent) = full_path.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::write(&full_path, &conflict.remote_content);
            }
            "manual" => {
                if let Some(content) = manual_content {
                    if let Some(parent) = full_path.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    let _ = fs::write(&full_path, content);
                }
            }
            "local" => {}
            _ => {}
        }

        Some(conflict)
    }

    pub fn update_remote_content(&mut self, path: &str, content: String) {
        if let Some(conflict) = self.conflicts.iter_mut().find(|c| c.path == path) {
            conflict.remote_content = content;
        }
    }

    pub fn len(&self) -> usize {
        self.conflicts.len()
    }
}
