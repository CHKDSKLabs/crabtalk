mod config;
mod conflicts;
mod ipc;
mod manifest;
mod network;
mod protocol;
mod rendezvous;
mod state;
mod sync;
mod types;
mod watcher;

use tokio::sync::{broadcast, mpsc};
use tracing::{info, warn};

use types::IpcEvent;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let cfg = config::load_config()?;
    info!(device = %cfg.device_name, "crabtalk-daemon loaded config");

    let claude_dir = dirs::home_dir()
        .ok_or("could not resolve home directory")?
        .join(".claude");

    let initial_manifest = manifest::build_manifest(&claude_dir, &cfg.sync_paths);
    info!(entries = initial_manifest.len(), "initial manifest built");

    let (event_tx, _) = broadcast::channel::<IpcEvent>(64);
    let shared = state::shared_state();

    {
        let mut s = shared.write().await;
        s.manifest = initial_manifest.clone();
    }

    let file_watcher =
        watcher::FileWatcher::start(claude_dir, cfg.sync_paths.clone(), initial_manifest)?;

    let watcher_state = shared.clone();
    let mut manifest_rx = file_watcher.manifest_rx;
    tokio::spawn(async move {
        while manifest_rx.changed().await.is_ok() {
            let new_manifest = manifest_rx.borrow_and_update().clone();
            let mut s = watcher_state.write().await;
            s.manifest = new_manifest;
        }
    });

    // sync_trigger: IPC sends () to trigger immediate sync with all connected peers
    let (sync_tx, sync_rx) = mpsc::channel::<()>(8);

    let ipc_tx = event_tx.clone();
    let ipc_cfg = cfg.clone();
    let ipc_state = shared.clone();
    tokio::spawn(async move {
        if let Err(e) = ipc::serve(ipc_tx, ipc_cfg, ipc_state, sync_tx).await {
            tracing::error!("ipc server exited: {e}");
        }
    });

    let net_tx = event_tx.clone();
    let net_cfg = cfg.clone();
    let net_state = shared.clone();
    tokio::spawn(async move {
        if let Err(e) = network::run(&net_cfg, net_tx, net_state, sync_rx).await {
            tracing::error!("network loop exited: {e}");
        }
    });

    tokio::signal::ctrl_c().await?;
    info!("shutdown signal received, deregistering from rendezvous");

    if let Err(e) = rendezvous::deregister(&cfg).await {
        warn!("rendezvous deregister on shutdown failed: {e}");
    }

    info!("bye");

    Ok(())
}
