use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tokio::sync::watch;
use tracing::{error, info, warn};

use crate::manifest::build_manifest;
use crate::types::FileManifestEntry;

pub struct FileWatcher {
    pub manifest_rx: watch::Receiver<HashMap<String, FileManifestEntry>>,
    _watcher: RecommendedWatcher,
}

impl FileWatcher {
    pub fn start(
        claude_dir: PathBuf,
        sync_paths: Vec<String>,
        initial_manifest: HashMap<String, FileManifestEntry>,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        let (manifest_tx, manifest_rx) = watch::channel(initial_manifest);
        let (notify_tx, mut notify_rx) = tokio::sync::mpsc::unbounded_channel::<PathBuf>();

        let mut watcher = notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
            match res {
                Ok(event) => {
                    for path in event.paths {
                        let _ = notify_tx.send(path);
                    }
                }
                Err(e) => warn!("file watcher error: {e}"),
            }
        })?;

        for sync_path in &sync_paths {
            let full_path = claude_dir.join(sync_path);
            if sync_path.ends_with('/') {
                if full_path.is_dir() {
                    watcher.watch(&full_path, RecursiveMode::Recursive)?;
                }
            } else if full_path.exists() {
                watcher.watch(&full_path, RecursiveMode::NonRecursive)?;
            }
        }

        info!(dir = %claude_dir.display(), "file watcher started");

        tokio::spawn(async move {
            let debounce = Duration::from_secs(3);

            loop {
                if notify_rx.recv().await.is_none() {
                    break;
                }

                loop {
                    tokio::time::sleep(debounce).await;

                    let mut drained = false;
                    while notify_rx.try_recv().is_ok() {
                        drained = true;
                    }

                    if !drained {
                        break;
                    }
                }

                let dir = claude_dir.clone();
                let paths = sync_paths.clone();
                let result =
                    tokio::task::spawn_blocking(move || build_manifest(&dir, &paths)).await;

                match result {
                    Ok(manifest) => {
                        info!(entries = manifest.len(), "manifest rebuilt after file changes");
                        if manifest_tx.send(manifest).is_err() {
                            error!("manifest channel closed, watcher shutting down");
                            break;
                        }
                    }
                    Err(e) => {
                        error!("failed to rebuild manifest: {e}");
                    }
                }
            }
        });

        Ok(FileWatcher {
            manifest_rx,
            _watcher: watcher,
        })
    }
}
