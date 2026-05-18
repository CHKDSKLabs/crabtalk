use std::collections::HashSet;
use std::time::Duration;

use base64::prelude::*;
use futures::prelude::*;
use libp2p::{
    Multiaddr, PeerId, SwarmBuilder, identity, mdns,
    request_response::{self, ProtocolSupport},
    swarm::{NetworkBehaviour, SwarmEvent},
};
use tokio::sync::{broadcast, mpsc};
use tracing::{info, warn};

use crate::config::{self, CrabTalkConfig};
use crate::protocol::{FileCodec, FileRequestMsg, ManifestCodec, ManifestRequest};
use crate::rendezvous;
use crate::state::SharedState;
use crate::sync::SyncManager;
use crate::types::IpcEvent;

#[derive(NetworkBehaviour)]
pub struct CrabTalkBehaviour {
    pub mdns: mdns::tokio::Behaviour,
    pub manifest_rr: request_response::Behaviour<ManifestCodec>,
    pub file_rr: request_response::Behaviour<FileCodec>,
}

fn load_or_generate_keypair(
    config: &CrabTalkConfig,
) -> Result<identity::Keypair, Box<dyn std::error::Error>> {
    if let Some(ref encoded) = config.keypair {
        let bytes = BASE64_STANDARD.decode(encoded)?;
        let keypair = identity::Keypair::from_protobuf_encoding(&bytes)?;
        return Ok(keypair);
    }

    let keypair = identity::Keypair::generate_ed25519();

    let mut config = config.clone();
    let kp_bytes = keypair
        .to_protobuf_encoding()
        .map_err(|e| format!("failed to encode keypair: {e}"))?;
    config.keypair = Some(BASE64_STANDARD.encode(&kp_bytes));
    config::save_config(&config)?;

    Ok(keypair)
}

pub async fn run(
    config: &CrabTalkConfig,
    event_tx: broadcast::Sender<IpcEvent>,
    state: SharedState,
    mut sync_trigger: mpsc::Receiver<()>,
) -> Result<(), Box<dyn std::error::Error>> {
    let keypair = load_or_generate_keypair(config)?;
    let peer_id = keypair.public().to_peer_id();

    info!(%peer_id, "local peer identity loaded");

    {
        let mut s = state.write().await;
        s.peer_id = peer_id.to_string();
    }

    let claude_dir = dirs::home_dir()
        .ok_or("could not resolve home directory")?
        .join(".claude");

    let sync_manager =
        SyncManager::new(config.clone(), claude_dir, state.clone(), event_tx.clone());

    let mut swarm = SwarmBuilder::with_existing_identity(keypair)
        .with_tokio()
        .with_quic()
        .with_behaviour(|key| {
            let mdns =
                mdns::tokio::Behaviour::new(mdns::Config::default(), key.public().to_peer_id())?;

            let manifest_rr = request_response::Behaviour::new(
                [(ManifestCodec::protocol(), ProtocolSupport::Full)],
                request_response::Config::default(),
            );

            let file_rr = request_response::Behaviour::new(
                [(FileCodec::protocol(), ProtocolSupport::Full)],
                request_response::Config::default(),
            );

            Ok(CrabTalkBehaviour {
                mdns,
                manifest_rr,
                file_rr,
            })
        })
        .map_err(|e| format!("failed to build swarm: {e}"))?
        .with_swarm_config(|cfg| cfg.with_idle_connection_timeout(Duration::from_secs(120)))
        .build();

    swarm.listen_on("/ip4/0.0.0.0/udp/0/quic-v1".parse()?)?;

    let mut rendezvous_registered = false;
    let mut rendezvous_interval = tokio::time::interval(Duration::from_secs(300));
    rendezvous_interval.tick().await;

    // Track connected peers locally so we can sync all of them on SyncNow
    let mut connected_peers: HashSet<PeerId> = HashSet::new();

    // Track in-flight file transfers: peer -> (paths_pending, synced_count, conflict_count)
    // Simplified: just count files received per sync session
    let mut pending_file_counts: std::collections::HashMap<PeerId, (usize, u32, u32)> =
        std::collections::HashMap::new();

    loop {
        tokio::select! {
            event = swarm.select_next_some() => match event {
                SwarmEvent::NewListenAddr { address, .. } => {
                    info!(%address, "listening");
                    {
                        let mut s = state.write().await;
                        s.listen_addrs.push(address.to_string());
                    }

                    if !rendezvous_registered {
                        rendezvous_registered = true;
                        let addrs = state.read().await.listen_addrs.clone();
                        if let Err(e) = rendezvous::register(config, addrs).await {
                            warn!("rendezvous registration failed: {e}");
                        }

                        match rendezvous::fetch_peers(config).await {
                            Ok(peers) => {
                                for peer in peers {
                                    for addr_str in &peer.multiaddrs {
                                        match addr_str.parse::<Multiaddr>() {
                                            Ok(addr) => {
                                                info!(%addr, device = %peer.device_name, "dialing rendezvous peer");
                                                if let Err(e) = swarm.dial(addr) {
                                                    warn!(device = %peer.device_name, "failed to dial rendezvous peer: {e}");
                                                }
                                            }
                                            Err(e) => {
                                                warn!(addr = %addr_str, "invalid multiaddr from rendezvous: {e}");
                                            }
                                        }
                                    }
                                }
                            }
                            Err(e) => {
                                warn!("rendezvous fetch_peers failed: {e}");
                            }
                        }
                    }
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::Mdns(mdns::Event::Discovered(peers))) => {
                    for (peer, addr) in peers {
                        info!(%peer, %addr, "mdns discovered peer");
                        if let Err(e) = swarm.dial(peer) {
                            warn!(%peer, "failed to dial discovered peer: {e}");
                        }
                    }
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::Mdns(mdns::Event::Expired(peers))) => {
                    for (peer, addr) in peers {
                        info!(%peer, %addr, "mdns peer expired");
                    }
                }

                SwarmEvent::ConnectionEstablished { peer_id, .. } => {
                    info!(%peer_id, "peer connected");
                    {
                        let mut s = state.write().await;
                        let id = peer_id.to_string();
                        if !s.connected_peers.contains(&id) {
                            s.connected_peers.push(id);
                        }
                    }
                    connected_peers.insert(peer_id);
                    let _ = event_tx.send(IpcEvent::PeerConnected { device: peer_id.to_string() });

                    sync_manager.initiate_sync(&mut swarm, peer_id).await;
                }

                SwarmEvent::ConnectionClosed { peer_id, .. } => {
                    info!(%peer_id, "peer disconnected");
                    {
                        let mut s = state.write().await;
                        s.connected_peers.retain(|p| p != &peer_id.to_string());
                    }
                    connected_peers.remove(&peer_id);
                    pending_file_counts.remove(&peer_id);
                    let _ = event_tx.send(IpcEvent::PeerDisconnected { device: peer_id.to_string() });
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::ManifestRr(
                    request_response::Event::Message {
                        peer,
                        message: request_response::Message::Request { request, channel, .. },
                    },
                )) => {
                    let ManifestRequest(entries) = request;
                    let response = sync_manager.handle_manifest_request(entries).await;

                    let conflicts_count = response.0.conflicts.len() as u32;
                    let request_paths: Vec<String> = response
                        .0
                        .need
                        .iter()
                        .chain(response.0.conflicts.iter())
                        .cloned()
                        .collect();
                    let need_count = request_paths.len();

                    if let Err(e) = swarm.behaviour_mut().manifest_rr.send_response(channel, response) {
                        warn!(%peer, "failed to send manifest response: {e:?}");
                        continue;
                    }

                    if need_count == 0 {
                        sync_manager.finish_sync(0, conflicts_count).await;
                    } else {
                        pending_file_counts.insert(peer, (need_count, 0, conflicts_count));
                        for path in request_paths {
                            swarm.behaviour_mut().file_rr.send_request(
                                &peer,
                                FileRequestMsg(crate::protocol::FileRequest { path }),
                            );
                        }
                    }
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::ManifestRr(
                    request_response::Event::Message {
                        peer,
                        message: request_response::Message::Response { response, .. },
                    },
                )) => {
                    let conflicts = response.0.conflicts.len() as u32;
                    let need_count = response.0.sending.len() + response.0.conflicts.len(); // files we request from them

                    pending_file_counts.insert(peer, (need_count, 0, conflicts));

                    sync_manager.handle_manifest_response(peer, response.0, &mut swarm).await;

                    // If there's nothing to transfer, emit SyncComplete immediately
                    if need_count == 0 {
                        sync_manager.finish_sync(0, conflicts).await;
                        pending_file_counts.remove(&peer);
                    }
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::ManifestRr(
                    request_response::Event::OutboundFailure { peer, error, .. },
                )) => {
                    warn!(%peer, ?error, "manifest outbound failure");
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::ManifestRr(
                    request_response::Event::InboundFailure { peer, error, .. },
                )) => {
                    warn!(%peer, ?error, "manifest inbound failure");
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::FileRr(
                    request_response::Event::Message {
                        peer,
                        message: request_response::Message::Request { request, channel, .. },
                    },
                )) => {
                    let FileRequestMsg(req) = request;
                    match sync_manager.handle_file_request(&req.path).await {
                        Some(response) => {
                            if let Err(e) = swarm.behaviour_mut().file_rr.send_response(channel, response) {
                                warn!(%peer, path = %req.path, "failed to send file response: {e:?}");
                            }
                        }
                        None => {
                            warn!(%peer, path = %req.path, "file requested but not found locally");
                        }
                    }
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::FileRr(
                    request_response::Event::Message {
                        peer,
                        message: request_response::Message::Response { response, .. },
                    },
                )) => {
                    let path = response.entry.path.clone();
                    let entry = response.entry.clone();
                    sync_manager.handle_file_response(&path, entry, response.content).await;

                    if let Some((pending, synced, conflicts)) = pending_file_counts.get_mut(&peer) {
                        *synced += 1;
                        if *synced as usize >= *pending {
                            let s = *synced;
                            let c = *conflicts;
                            pending_file_counts.remove(&peer);
                            sync_manager.finish_sync(s, c).await;
                        }
                    }
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::FileRr(
                    request_response::Event::OutboundFailure { peer, error, .. },
                )) => {
                    warn!(%peer, ?error, "file outbound failure");
                }

                SwarmEvent::Behaviour(CrabTalkBehaviourEvent::FileRr(
                    request_response::Event::InboundFailure { peer, error, .. },
                )) => {
                    warn!(%peer, ?error, "file inbound failure");
                }

                _ => {}
            },

            _ = rendezvous_interval.tick() => {
                let addrs = state.read().await.listen_addrs.clone();
                if !addrs.is_empty() {
                    if let Err(e) = rendezvous::register(config, addrs).await {
                        warn!("periodic rendezvous re-registration failed: {e}");
                    }
                }
            }

            Some(()) = sync_trigger.recv() => {
                let peers: Vec<PeerId> = connected_peers.iter().cloned().collect();
                if peers.is_empty() {
                    info!("sync-now triggered but no connected peers");
                } else {
                    for peer in peers {
                        info!(%peer, "sync-now triggered");
                        sync_manager.initiate_sync(&mut swarm, peer).await;
                    }
                }
            }
        }
    }
}
