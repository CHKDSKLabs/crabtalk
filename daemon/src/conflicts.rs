use std::fs;
use std::path::{Component, Path, PathBuf};

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

    pub fn get(&self, path: &str) -> Option<&SyncConflict> {
        self.conflicts.iter().find(|c| c.path == path)
    }

    pub fn resolve(
        &mut self,
        path: &str,
        resolution: &str,
        manual_content: Option<&str>,
        claude_dir: &Path,
    ) -> Option<SyncConflict> {
        if !matches!(resolution, "local" | "remote" | "manual") {
            return None;
        }
        if resolution == "manual" && manual_content.is_none() {
            return None;
        }

        let full_path = safe_claude_path(claude_dir, path)?;
        let pos = self.conflicts.iter().position(|c| c.path == path)?;
        if resolution == "remote" && self.conflicts[pos].remote_content.is_empty() {
            return None;
        }

        let conflict = self.conflicts.remove(pos);

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

fn safe_claude_path(claude_dir: &Path, path: &str) -> Option<PathBuf> {
    if path.is_empty() || path.contains('\\') {
        return None;
    }

    let mut clean = PathBuf::new();
    for component in Path::new(path).components() {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock before epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("crabtalk-conflicts-test-{suffix}"))
    }

    fn conflict(path: &str) -> SyncConflict {
        SyncConflict {
            path: path.to_string(),
            local_hash: "local".to_string(),
            remote_hash: "remote".to_string(),
            local_modified_at: 1,
            remote_modified_at: 2,
            local_device_name: "local-device".to_string(),
            remote_device_name: "remote-device".to_string(),
            local_content: "local".to_string(),
            remote_content: "remote".to_string(),
        }
    }

    #[test]
    fn remote_resolution_writes_remote_content() {
        let dir = temp_dir();
        let mut store = ConflictStore::new();
        store.add(conflict("settings.json"));

        let resolved = store.resolve("settings.json", "remote", None, &dir);

        assert!(resolved.is_some());
        assert_eq!(
            std::fs::read_to_string(dir.join("settings.json")).unwrap(),
            "remote"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn invalid_manual_resolution_keeps_conflict() {
        let dir = temp_dir();
        let mut store = ConflictStore::new();
        store.add(conflict("settings.json"));

        let resolved = store.resolve("settings.json", "manual", None, &dir);

        assert!(resolved.is_none());
        assert_eq!(store.len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn unsafe_paths_are_rejected_without_removing_conflict() {
        let dir = temp_dir();
        let mut store = ConflictStore::new();
        store.add(conflict("../outside.txt"));

        let resolved = store.resolve("../outside.txt", "remote", None, &dir);

        assert!(resolved.is_none());
        assert_eq!(store.len(), 1);
        assert!(!dir.join("../outside.txt").exists());
    }
}
