use async_trait::async_trait;
use futures::prelude::*;
use libp2p::{StreamProtocol, request_response};
use serde::{Deserialize, Serialize};

use crate::types::FileManifestEntry;

const MANIFEST_MAX_BYTES: usize = 1 * 1024 * 1024;
const FILE_MAX_BYTES: usize = 64 * 1024 * 1024;

// ─── Manifest protocol types ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManifestDiffResponse {
    pub need: Vec<String>,
    pub sending: Vec<String>,
    pub conflicts: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct ManifestRequest(pub Vec<(String, FileManifestEntry)>);

#[derive(Debug, Clone)]
pub struct ManifestResponse(pub ManifestDiffResponse);

#[derive(Debug, Clone, Default)]
pub struct ManifestCodec;

impl ManifestCodec {
    pub fn protocol() -> StreamProtocol {
        StreamProtocol::new("/crabtalk/manifest/1.0.0")
    }
}

#[async_trait]
impl request_response::Codec for ManifestCodec {
    type Protocol = StreamProtocol;
    type Request = ManifestRequest;
    type Response = ManifestResponse;

    async fn read_request<T>(
        &mut self,
        _: &StreamProtocol,
        io: &mut T,
    ) -> std::io::Result<ManifestRequest>
    where
        T: AsyncRead + Unpin + Send,
    {
        let bytes = read_length_prefixed(io, MANIFEST_MAX_BYTES).await?;
        let entries: Vec<(String, FileManifestEntry)> = serde_json::from_slice(&bytes)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        Ok(ManifestRequest(entries))
    }

    async fn read_response<T>(
        &mut self,
        _: &StreamProtocol,
        io: &mut T,
    ) -> std::io::Result<ManifestResponse>
    where
        T: AsyncRead + Unpin + Send,
    {
        let bytes = read_length_prefixed(io, MANIFEST_MAX_BYTES).await?;
        let diff: ManifestDiffResponse = serde_json::from_slice(&bytes)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        Ok(ManifestResponse(diff))
    }

    async fn write_request<T>(
        &mut self,
        _: &StreamProtocol,
        io: &mut T,
        ManifestRequest(entries): ManifestRequest,
    ) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let bytes = serde_json::to_vec(&entries)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        write_length_prefixed(io, &bytes).await
    }

    async fn write_response<T>(
        &mut self,
        _: &StreamProtocol,
        io: &mut T,
        ManifestResponse(diff): ManifestResponse,
    ) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let bytes = serde_json::to_vec(&diff)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        write_length_prefixed(io, &bytes).await
    }
}

// ─── File protocol types ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRequest {
    pub path: String,
}

#[derive(Debug, Clone)]
pub struct FileRequestMsg(pub FileRequest);

#[derive(Debug, Clone)]
pub struct FileResponseMsg {
    pub entry: FileManifestEntry,
    pub content: Vec<u8>,
}

#[derive(Debug, Clone, Default)]
pub struct FileCodec;

impl FileCodec {
    pub fn protocol() -> StreamProtocol {
        StreamProtocol::new("/crabtalk/file/1.0.0")
    }
}

#[async_trait]
impl request_response::Codec for FileCodec {
    type Protocol = StreamProtocol;
    type Request = FileRequestMsg;
    type Response = FileResponseMsg;

    async fn read_request<T>(
        &mut self,
        _: &StreamProtocol,
        io: &mut T,
    ) -> std::io::Result<FileRequestMsg>
    where
        T: AsyncRead + Unpin + Send,
    {
        let bytes = read_length_prefixed(io, MANIFEST_MAX_BYTES).await?;
        let req: FileRequest = serde_json::from_slice(&bytes)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        Ok(FileRequestMsg(req))
    }

    async fn read_response<T>(
        &mut self,
        _: &StreamProtocol,
        io: &mut T,
    ) -> std::io::Result<FileResponseMsg>
    where
        T: AsyncRead + Unpin + Send,
    {
        // [4-byte entry JSON length][entry JSON][file content to EOF]
        let entry_bytes = read_length_prefixed(io, MANIFEST_MAX_BYTES).await?;
        let entry: FileManifestEntry = serde_json::from_slice(&entry_bytes)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        let mut content = Vec::new();
        io.read_to_end(&mut content).await?;

        if content.len() > FILE_MAX_BYTES {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                format!("file too large: {} bytes", content.len()),
            ));
        }

        Ok(FileResponseMsg { entry, content })
    }

    async fn write_request<T>(
        &mut self,
        _: &StreamProtocol,
        io: &mut T,
        FileRequestMsg(req): FileRequestMsg,
    ) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let bytes = serde_json::to_vec(&req)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
        write_length_prefixed(io, &bytes).await
    }

    async fn write_response<T>(
        &mut self,
        _: &StreamProtocol,
        io: &mut T,
        resp: FileResponseMsg,
    ) -> std::io::Result<()>
    where
        T: AsyncWrite + Unpin + Send,
    {
        let entry_bytes = serde_json::to_vec(&resp.entry)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;

        // 4-byte length prefix for the entry JSON
        let len = (entry_bytes.len() as u32).to_be_bytes();
        io.write_all(&len).await?;
        io.write_all(&entry_bytes).await?;

        // File content runs to EOF — no length prefix
        io.write_all(&resp.content).await?;
        io.close().await?;
        Ok(())
    }
}

// ─── Shared framing helpers ──────────────────────────────────────────────────

async fn read_length_prefixed<T>(io: &mut T, max_bytes: usize) -> std::io::Result<Vec<u8>>
where
    T: AsyncRead + Unpin + Send,
{
    let mut len_buf = [0u8; 4];
    io.read_exact(&mut len_buf).await?;
    let len = u32::from_be_bytes(len_buf) as usize;
    if len > max_bytes {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("message too large: {len} bytes (max {max_bytes})"),
        ));
    }
    let mut buf = vec![0u8; len];
    io.read_exact(&mut buf).await?;
    Ok(buf)
}

async fn write_length_prefixed<T>(io: &mut T, data: &[u8]) -> std::io::Result<()>
where
    T: AsyncWrite + Unpin + Send,
{
    let len = (data.len() as u32).to_be_bytes();
    io.write_all(&len).await?;
    io.write_all(data).await?;
    io.close().await?;
    Ok(())
}
