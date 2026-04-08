use std::io;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::sync::{broadcast, mpsc};
use tracing::{error, info, warn};

use crate::config::CrabTalkConfig;
use crate::state::SharedState;
use crate::types::{IpcCommand, IpcEvent};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcRequest {
    #[serde(rename = "requestId")]
    pub request_id: Option<String>,
    #[serde(flatten)]
    pub command: IpcCommand,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcResponse {
    #[serde(rename = "requestId", skip_serializing_if = "Option::is_none")]
    pub request_id: Option<String>,
    #[serde(flatten)]
    pub result: Value,
}

#[cfg(windows)]
mod transport {
    use std::io;
    use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};

    pub const PIPE_NAME: &str = r"\\.\pipe\crabtalk-daemon";

    pub struct Listener {
        pending: Option<NamedPipeServer>,
    }

    impl Listener {
        pub fn bind() -> io::Result<Self> {
            let server = ServerOptions::new()
                .first_pipe_instance(true)
                .create(PIPE_NAME)?;
            Ok(Listener { pending: Some(server) })
        }

        pub async fn accept(&mut self) -> io::Result<NamedPipeServer> {
            let server = self.pending.take().expect("accept called after exhaustion");
            server.connect().await?;
            // Create the next waiter before returning so new clients can queue up.
            self.pending = Some(ServerOptions::new().create(PIPE_NAME)?);
            Ok(server)
        }
    }
}

#[cfg(unix)]
mod transport {
    use std::io;
    use std::path::PathBuf;
    use tokio::net::{UnixListener, UnixStream};

    pub fn socket_path() -> PathBuf {
        dirs::home_dir()
            .expect("home dir unavailable")
            .join(".claude")
            .join("crabtalk.sock")
    }

    pub struct Listener {
        inner: UnixListener,
    }

    impl Listener {
        pub fn bind() -> io::Result<Self> {
            let path = socket_path();
            if path.exists() {
                std::fs::remove_file(&path)?;
            }
            Ok(Listener { inner: UnixListener::bind(path)? })
        }

        pub async fn accept(&mut self) -> io::Result<UnixStream> {
            let (stream, _) = self.inner.accept().await?;
            Ok(stream)
        }
    }
}

async fn dispatch(
    cmd: IpcCommand,
    cfg: &CrabTalkConfig,
    state: &SharedState,
    sync_tx: &mpsc::Sender<()>,
) -> Value {
    match cmd {
        IpcCommand::Status => {
            let s = state.read().await;
            serde_json::json!({
                "deviceName": cfg.device_name,
                "peerId": s.peer_id,
                "listenAddrs": s.listen_addrs,
                "connected": !s.connected_peers.is_empty(),
                "peers": s.connected_peers
            })
        }
        IpcCommand::GetManifest => {
            let s = state.read().await;
            serde_json::to_value(&s.manifest).unwrap_or_else(|e| {
                serde_json::json!({ "error": format!("failed to serialize manifest: {e}") })
            })
        }
        IpcCommand::SyncNow => {
            match sync_tx.try_send(()) {
                Ok(()) => serde_json::json!({ "ok": true }),
                Err(mpsc::error::TrySendError::Full(_)) => {
                    serde_json::json!({ "ok": true, "note": "sync already queued" })
                }
                Err(mpsc::error::TrySendError::Closed(_)) => {
                    serde_json::json!({ "error": "network loop unavailable" })
                }
            }
        }
        IpcCommand::GetConflicts => {
            let s = state.read().await;
            let conflicts: Vec<_> = s.conflicts.list(None).into_iter().collect();
            serde_json::to_value(&conflicts).unwrap_or_else(|e| {
                serde_json::json!({ "error": format!("failed to serialize conflicts: {e}") })
            })
        }
        IpcCommand::ResolveConflict { path, resolution, content } => {
            let claude_dir = dirs::home_dir()
                .expect("home dir unavailable")
                .join(".claude");

            let mut s = state.write().await;
            let remaining = s.conflicts.len().saturating_sub(1);
            match s.conflicts.resolve(&path, &resolution, content.as_deref(), &claude_dir) {
                Some(_) => serde_json::json!({ "resolved": true, "remaining": remaining }),
                None => serde_json::json!({ "resolved": false, "error": "no conflict found" }),
            }
        }
    }
}

async fn handle_client<S>(
    stream: S,
    event_tx: broadcast::Sender<IpcEvent>,
    cfg: CrabTalkConfig,
    state: SharedState,
    sync_tx: mpsc::Sender<()>,
)
where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let mut event_rx = event_tx.subscribe();
    let (read_half, mut write_half) = tokio::io::split(stream);
    let mut lines = BufReader::new(read_half).lines();

    loop {
        tokio::select! {
            line = lines.next_line() => {
                match line {
                    Ok(Some(text)) => {
                        let response = match serde_json::from_str::<IpcRequest>(&text) {
                            Ok(req) => {
                                let request_id = req.request_id.clone();
                                let result = dispatch(req.command, &cfg, &state, &sync_tx).await;
                                IpcResponse { request_id, result }
                            }
                            Err(e) => {
                                warn!("malformed ipc request: {e}");
                                IpcResponse {
                                    request_id: None,
                                    result: serde_json::json!({ "error": format!("malformed request: {e}") }),
                                }
                            }
                        };

                        let mut json = serde_json::to_string(&response)
                            .unwrap_or_else(|_| r#"{"error":"serialization failure"}"#.to_string());
                        json.push('\n');

                        if let Err(e) = write_half.write_all(json.as_bytes()).await {
                            error!("ipc write error: {e}");
                            return;
                        }
                    }
                    Ok(None) => {
                        info!("ipc client disconnected");
                        return;
                    }
                    Err(e) => {
                        error!("ipc read error: {e}");
                        return;
                    }
                }
            }

            event = event_rx.recv() => {
                match event {
                    Ok(evt) => {
                        match serde_json::to_string(&evt) {
                            Ok(mut json) => {
                                json.push('\n');
                                if let Err(e) = write_half.write_all(json.as_bytes()).await {
                                    error!("ipc event write error: {e}");
                                    return;
                                }
                            }
                            Err(e) => error!("failed to serialize event: {e}"),
                        }
                    }
                    // Sender lagged — subscriber fell behind, just skip the gap.
                    Err(broadcast::error::RecvError::Lagged(n)) => {
                        warn!("ipc client dropped {n} events (too slow)");
                    }
                    Err(broadcast::error::RecvError::Closed) => return,
                }
            }
        }
    }
}

pub async fn serve(
    event_tx: broadcast::Sender<IpcEvent>,
    cfg: CrabTalkConfig,
    state: SharedState,
    sync_tx: mpsc::Sender<()>,
) -> io::Result<()> {
    let mut listener = transport::Listener::bind()?;

    #[cfg(windows)]
    info!(pipe = transport::PIPE_NAME, "ipc server listening");
    #[cfg(unix)]
    info!(socket = %transport::socket_path().display(), "ipc server listening");

    loop {
        match listener.accept().await {
            Ok(stream) => {
                info!("ipc client connected");
                let tx = event_tx.clone();
                let cfg = cfg.clone();
                let state = state.clone();
                let sync_tx = sync_tx.clone();
                tokio::spawn(async move {
                    handle_client(stream, tx, cfg, state, sync_tx).await;
                });
            }
            Err(e) => {
                error!("ipc accept error: {e}");
            }
        }
    }
}
