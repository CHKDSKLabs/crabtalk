use std::collections::HashMap;
use std::path::Path;
use std::time::UNIX_EPOCH;

use sha2::{Digest, Sha256};

use crate::types::FileManifestEntry;

pub fn build_manifest(
    claude_dir: &Path,
    sync_paths: &[String],
) -> HashMap<String, FileManifestEntry> {
    let mut manifest = HashMap::new();

    for sync_path in sync_paths {
        let full_path = claude_dir.join(sync_path);

        if sync_path.ends_with('/') {
            if full_path.is_dir() {
                walk_directory(&full_path, claude_dir, &mut manifest);
            }
        } else if full_path.is_file() {
            if let Some(entry) = hash_file(&full_path, claude_dir) {
                manifest.insert(entry.path.clone(), entry);
            }
        }
    }

    manifest
}

fn walk_directory(
    dir: &Path,
    claude_dir: &Path,
    manifest: &mut HashMap<String, FileManifestEntry>,
) {
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = entry.file_name();
        let name = file_name.to_string_lossy();

        if name.starts_with('.') || name == "node_modules" {
            continue;
        }

        if path.is_dir() {
            walk_directory(&path, claude_dir, manifest);
        } else if path.is_file() {
            if let Some(entry) = hash_file(&path, claude_dir) {
                manifest.insert(entry.path.clone(), entry);
            }
        }
    }
}

fn hash_file(path: &Path, claude_dir: &Path) -> Option<FileManifestEntry> {
    let contents = std::fs::read(path).ok()?;
    let metadata = std::fs::metadata(path).ok()?;

    let mut hasher = Sha256::new();
    hasher.update(&contents);
    let hash = format!("{:x}", hasher.finalize());

    let modified_at = metadata
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;

    let relative = path.strip_prefix(claude_dir).ok()?;
    let normalized = relative.to_string_lossy().replace('\\', "/");

    Some(FileManifestEntry {
        path: normalized,
        hash,
        modified_at,
        size: metadata.len(),
    })
}

pub struct ManifestDiff {
    pub local_only: Vec<String>,
    pub remote_only: Vec<String>,
    pub local_newer: Vec<String>,
    pub remote_newer: Vec<String>,
    pub conflicts: Vec<String>,
}

pub fn diff_manifests(
    local: &HashMap<String, FileManifestEntry>,
    remote: &HashMap<String, FileManifestEntry>,
) -> ManifestDiff {
    let mut diff = ManifestDiff {
        local_only: Vec::new(),
        remote_only: Vec::new(),
        local_newer: Vec::new(),
        remote_newer: Vec::new(),
        conflicts: Vec::new(),
    };

    for (path, local_entry) in local {
        match remote.get(path) {
            None => diff.local_only.push(path.clone()),
            Some(remote_entry) => {
                if local_entry.hash != remote_entry.hash {
                    if local_entry.modified_at > remote_entry.modified_at {
                        diff.local_newer.push(path.clone());
                    } else if remote_entry.modified_at > local_entry.modified_at {
                        diff.remote_newer.push(path.clone());
                    } else {
                        diff.conflicts.push(path.clone());
                    }
                }
            }
        }
    }

    for path in remote.keys() {
        if !local.contains_key(path) {
            diff.remote_only.push(path.clone());
        }
    }

    diff
}
