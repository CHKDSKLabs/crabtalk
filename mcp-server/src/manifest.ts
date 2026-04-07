import { createHash } from "crypto";
import { readFile, readdir, stat } from "fs/promises";
import { join, relative } from "path";
import type { FileManifest, FileManifestEntry } from "./types.js";

export async function buildManifest(
  claudeDir: string,
  syncPaths: string[]
): Promise<FileManifest> {
  const manifest: FileManifest = new Map();

  for (const syncPath of syncPaths) {
    const fullPath = join(claudeDir, syncPath);
    try {
      const entries = await collectFiles(fullPath, claudeDir);
      for (const entry of entries) {
        manifest.set(entry.path, entry);
      }
    } catch {
      // Path doesn't exist yet — that's fine, nothing to sync
    }
  }

  return manifest;
}

async function collectFiles(
  dirOrFile: string,
  baseDir: string
): Promise<FileManifestEntry[]> {
  const entries: FileManifestEntry[] = [];
  const fileStat = await stat(dirOrFile);

  if (fileStat.isFile()) {
    const content = await readFile(dirOrFile);
    const hash = createHash("sha256").update(content).digest("hex");
    const relPath = relative(baseDir, dirOrFile).replace(/\\/g, "/");

    entries.push({
      path: relPath,
      hash,
      modifiedAt: fileStat.mtimeMs,
      size: fileStat.size,
    });
  } else if (fileStat.isDirectory()) {
    const children = await readdir(dirOrFile);
    for (const child of children) {
      const childEntries = await collectFiles(join(dirOrFile, child), baseDir);
      entries.push(...childEntries);
    }
  }

  return entries;
}

export function diffManifests(
  local: FileManifest,
  remote: FileManifest
): {
  localOnly: string[];
  remoteOnly: string[];
  conflicts: string[];
  remoteNewer: string[];
  localNewer: string[];
} {
  const localOnly: string[] = [];
  const remoteOnly: string[] = [];
  const conflicts: string[] = [];
  const remoteNewer: string[] = [];
  const localNewer: string[] = [];

  for (const [path, localEntry] of local) {
    const remoteEntry = remote.get(path);
    if (!remoteEntry) {
      localOnly.push(path);
    } else if (localEntry.hash !== remoteEntry.hash) {
      if (localEntry.modifiedAt > remoteEntry.modifiedAt) {
        localNewer.push(path);
      } else if (remoteEntry.modifiedAt > localEntry.modifiedAt) {
        remoteNewer.push(path);
      } else {
        conflicts.push(path);
      }
    }
  }

  for (const path of remote.keys()) {
    if (!local.has(path)) {
      remoteOnly.push(path);
    }
  }

  return { localOnly, remoteOnly, conflicts, remoteNewer, localNewer };
}
