use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrabTalkConfig {
    pub device_name: String,
    pub user_id: String,
    pub signal_url: String,
    pub auth_token: String,
    pub sync_paths: Vec<String>,
    pub keypair: Option<String>,
}

fn config_path() -> Result<PathBuf, Box<dyn std::error::Error>> {
    let home = dirs::home_dir().ok_or("could not resolve home directory")?;
    Ok(home.join(".claude").join("crabtalk.json"))
}

pub fn load_config() -> Result<CrabTalkConfig, Box<dyn std::error::Error>> {
    let path = config_path()?;
    let contents = std::fs::read_to_string(&path)
        .map_err(|e| format!("failed to read {}: {e}", path.display()))?;
    let config: CrabTalkConfig = serde_json::from_str(&contents)
        .map_err(|e| format!("failed to parse {}: {e}", path.display()))?;
    Ok(config)
}

pub fn save_config(config: &CrabTalkConfig) -> Result<(), Box<dyn std::error::Error>> {
    let path = config_path()?;
    let json = serde_json::to_string_pretty(config)?;
    std::fs::write(&path, json)
        .map_err(|e| format!("failed to write {}: {e}", path.display()))?;
    Ok(())
}
