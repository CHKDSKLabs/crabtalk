#!/usr/bin/env node
import { existsSync, mkdirSync, chmodSync, createWriteStream } from "fs";
import { join } from "path";
import { homedir, platform, arch } from "os";
import { get } from "https";
import { pipeline } from "stream/promises";
import { createGunzip } from "zlib";

const REPO = "ObtuseAglet/crabtalk";
const BIN_DIR = join(homedir(), ".claude", "bin");
const BINARY_NAME = platform() === "win32" ? "crabtalk-daemon.exe" : "crabtalk-daemon";
const BINARY_PATH = join(BIN_DIR, BINARY_NAME);

function getAssetName() {
  const os = platform();
  const cpu = arch();

  const osMap = { win32: "windows", darwin: "macos", linux: "linux" };
  const archMap = { x64: "x86_64", arm64: "aarch64" };

  const osName = osMap[os];
  const archName = archMap[cpu];

  if (!osName || !archName) {
    throw new Error(`Unsupported platform: ${os}-${cpu}`);
  }

  const ext = os === "win32" ? ".zip" : ".tar.gz";
  return `crabtalk-daemon-${archName}-${osName}${ext}`;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpsGet(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        res.resume();
        return;
      }
      resolve(res);
    }).on("error", reject);
  });
}

async function getLatestRelease() {
  const res = await httpsGet(`https://api.github.com/repos/${REPO}/releases/latest`);
  const chunks = [];
  for await (const chunk of res) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}

async function downloadAndExtract(url) {
  mkdirSync(BIN_DIR, { recursive: true });
  const res = await httpsGet(url);

  if (url.endsWith(".tar.gz")) {
    const { extract } = await import("tar");
    const tarStream = res.pipe(createGunzip());
    await extract({ cwd: BIN_DIR, strip: 1 }, tarStream);
  } else {
    // .zip — download to temp, extract with built-in tools
    const tmpZip = join(BIN_DIR, "_crabtalk-download.zip");
    await pipeline(res, createWriteStream(tmpZip));

    if (platform() === "win32") {
      const { execFileSync } = await import("child_process");
      execFileSync("powershell", [
        "-NoProfile", "-Command",
        `Expand-Archive -Force -Path '${tmpZip}' -DestinationPath '${BIN_DIR}'`,
      ]);
    } else {
      const { execFileSync } = await import("child_process");
      execFileSync("unzip", ["-o", tmpZip, "-d", BIN_DIR]);
    }

    const { unlinkSync } = await import("fs");
    try { unlinkSync(tmpZip); } catch {}
  }

  if (platform() !== "win32") {
    chmodSync(BINARY_PATH, 0o755);
  }
}

export async function ensureDaemon() {
  if (existsSync(BINARY_PATH)) {
    return BINARY_PATH;
  }

  console.error("[CrabTalk] Daemon binary not found. Downloading latest release...");

  try {
    const release = await getLatestRelease();
    const assetName = getAssetName();
    const asset = release.assets?.find((a) => a.name === assetName);

    if (!asset) {
      throw new Error(
        `No binary for this platform (${assetName}). Available: ${release.assets?.map((a) => a.name).join(", ") || "none"}`
      );
    }

    await downloadAndExtract(asset.browser_download_url);

    if (!existsSync(BINARY_PATH)) {
      throw new Error(`Download succeeded but binary not found at ${BINARY_PATH}`);
    }

    console.error(`[CrabTalk] Daemon installed to ${BINARY_PATH}`);
    return BINARY_PATH;
  } catch (err) {
    console.error(`[CrabTalk] Auto-download failed: ${err.message}`);
    console.error("[CrabTalk] Install manually: https://github.com/ObtuseAglet/crabtalk/releases");
    return null;
  }
}
