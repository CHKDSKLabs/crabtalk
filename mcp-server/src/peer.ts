import * as nodeDataChannel from "node-datachannel";
import type { SignalMessage, FileManifestEntry } from "./types.js";

const { PeerConnection, DataChannel, DescriptionType } = nodeDataChannel;

const CHUNK_SIZE = 64 * 1024; // 64KB — well under any WebRTC implementation's message size limit

type SendSignal = (msg: SignalMessage) => void;
type OnFileReceived = (path: string, content: Buffer, entry: FileManifestEntry) => void;
type OnManifestReceived = (manifest: Map<string, FileManifestEntry>) => void;
type OnConnected = () => void;

interface InboundFile {
  chunks: string[];
  totalChunks: number;
}

export class PeerConnection_ {
  private pc: InstanceType<typeof PeerConnection>;
  private dc: InstanceType<typeof DataChannel> | null = null;
  private sendSignal: SendSignal;
  private onFileReceived: OnFileReceived;
  private onManifestReceived: OnManifestReceived;
  private onConnected: OnConnected;
  private localDeviceName: string;
  private remoteDeviceName: string;
  private inboundFiles = new Map<string, InboundFile>();

  connected = false;
  private offerSent = false;

  constructor(
    localDeviceName: string,
    remoteDeviceName: string,
    sendSignal: SendSignal,
    onFileReceived: OnFileReceived,
    onManifestReceived: OnManifestReceived,
    onConnected: OnConnected
  ) {
    this.localDeviceName = localDeviceName;
    this.remoteDeviceName = remoteDeviceName;
    this.sendSignal = sendSignal;
    this.onFileReceived = onFileReceived;
    this.onManifestReceived = onManifestReceived;
    this.onConnected = onConnected;

    this.pc = new PeerConnection(`crabtalk-${localDeviceName}`, {
      iceServers: ["stun:stun.l.google.com:19302"],
    });

    this.pc.onLocalDescription((sdp, type) => {
      this.sendSignal({
        type: type as "offer" | "answer",
        from: this.localDeviceName,
        to: this.remoteDeviceName,
        payload: { sdp, type },
      });
    });

    this.pc.onLocalCandidate((candidate, mid) => {
      this.sendSignal({
        type: "ice-candidate",
        from: this.localDeviceName,
        to: this.remoteDeviceName,
        payload: { candidate, mid },
      });
    });

    this.pc.onDataChannel((dc) => {
      this.setupDataChannel(dc);
    });
  }

  async createOffer(): Promise<void> {
    this.offerSent = true;
    this.dc = this.pc.createDataChannel("sync");
    this.setupDataChannel(this.dc);
  }

  async handleSignal(msg: SignalMessage): Promise<void> {
    const payload = msg.payload as Record<string, string>;

    switch (msg.type) {
      case "offer":
        this.pc.setRemoteDescription(payload.sdp, DescriptionType.Offer);
        break;
      case "answer":
        if (this.offerSent) {
          this.pc.setRemoteDescription(payload.sdp, DescriptionType.Answer);
        }
        break;
      case "ice-candidate":
        this.pc.addRemoteCandidate(payload.candidate, payload.mid);
        break;
    }
  }

  sendManifest(manifest: Map<string, FileManifestEntry>): void {
    if (!this.dc) return;
    const serialized = JSON.stringify({
      type: "manifest",
      entries: Array.from(manifest.entries()),
    });
    this.dc.sendMessage(serialized);
  }

  sendFile(path: string, content: Buffer, entry: FileManifestEntry): void {
    if (!this.dc) return;

    const base64 = content.toString("base64");
    const totalChunks = Math.ceil(base64.length / CHUNK_SIZE) || 1;

    for (let i = 0; i < totalChunks; i++) {
      const slice = base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      this.dc.sendMessage(JSON.stringify({
        type: "file-chunk",
        path,
        chunkIndex: i,
        totalChunks,
        data: slice,
      }));
    }

    this.dc.sendMessage(JSON.stringify({ type: "file-end", path, entry }));
  }

  close(): void {
    this.dc?.close();
    this.pc.close();
    this.connected = false;
  }

  private setupDataChannel(dc: InstanceType<typeof DataChannel>): void {
    this.dc = dc;

    dc.onOpen(() => {
      this.connected = true;
      console.error(`[CrabTalk] Data channel open with ${this.remoteDeviceName}`);
      this.onConnected();
    });

    dc.onClosed(() => {
      this.connected = false;
      console.error(`[CrabTalk] Data channel closed with ${this.remoteDeviceName}`);
    });

    dc.onMessage((msg) => {
      try {
        const data = JSON.parse(typeof msg === "string" ? msg : msg.toString());

        if (data.type === "manifest") {
          const manifest = new Map<string, FileManifestEntry>(data.entries);
          this.onManifestReceived(manifest);
        } else if (data.type === "file-chunk") {
          let inbound = this.inboundFiles.get(data.path);
          if (!inbound) {
            inbound = { chunks: new Array(data.totalChunks), totalChunks: data.totalChunks };
            this.inboundFiles.set(data.path, inbound);
          }
          inbound.chunks[data.chunkIndex] = data.data;
        } else if (data.type === "file-end") {
          const inbound = this.inboundFiles.get(data.path);
          if (!inbound) {
            console.error(`[CrabTalk] Received file-end for ${data.path} with no chunks`);
            return;
          }
          this.inboundFiles.delete(data.path);
          const content = Buffer.from(inbound.chunks.join(""), "base64");
          this.onFileReceived(data.path, content, data.entry);
        }
      } catch (err) {
        console.error("[CrabTalk] Failed to parse data channel message:", err);
      }
    });
  }
}
