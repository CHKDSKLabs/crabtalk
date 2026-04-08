use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{info, warn};

use crate::config::CrabTalkConfig;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RegisterBody {
    device_name: String,
    multiaddrs: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerRecord {
    pub device_name: String,
    pub multiaddrs: Vec<String>,
}

fn client() -> Client {
    Client::new()
}

pub async fn register(
    config: &CrabTalkConfig,
    multiaddrs: Vec<String>,
) -> Result<(), Box<dyn std::error::Error>> {
    let url = format!("{}/api/rendezvous", config.signal_url);
    let body = RegisterBody {
        device_name: config.device_name.clone(),
        multiaddrs,
    };

    let resp = client()
        .post(&url)
        .bearer_auth(&config.auth_token)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("rendezvous register request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("rendezvous register returned {status}: {text}").into());
    }

    info!("registered with rendezvous server");
    Ok(())
}

pub async fn fetch_peers(
    config: &CrabTalkConfig,
) -> Result<Vec<PeerRecord>, Box<dyn std::error::Error>> {
    let url = format!("{}/api/rendezvous", config.signal_url);

    let resp = client()
        .get(&url)
        .bearer_auth(&config.auth_token)
        .header("X-Device-Name", &config.device_name)
        .send()
        .await
        .map_err(|e| format!("rendezvous fetch_peers request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("rendezvous fetch_peers returned {status}: {text}").into());
    }

    let peers: Vec<PeerRecord> = resp
        .json()
        .await
        .map_err(|e| format!("failed to parse rendezvous peer list: {e}"))?;

    info!(count = peers.len(), "fetched peers from rendezvous server");
    Ok(peers)
}

pub async fn deregister(config: &CrabTalkConfig) -> Result<(), Box<dyn std::error::Error>> {
    let url = format!(
        "{}/api/rendezvous/{}",
        config.signal_url, config.device_name
    );

    let resp = client()
        .delete(&url)
        .bearer_auth(&config.auth_token)
        .send()
        .await
        .map_err(|e| format!("rendezvous deregister request failed: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        warn!(%status, %text, "rendezvous deregister failed (best-effort)");
        return Ok(());
    }

    info!("deregistered from rendezvous server");
    Ok(())
}
