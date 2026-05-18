import assert from "node:assert/strict";
import test from "node:test";
import { SyncEngine } from "./sync-engine.js";
import type { CrabTalkConfig } from "./types.js";

const config: CrabTalkConfig = {
  deviceName: "Fiddler",
  userId: "user-1",
  signalUrl: "https://signal.example",
  authToken: "token",
  syncPaths: ["plugins/"],
};

function engineWithClient(client: unknown): SyncEngine {
  const engine = new SyncEngine(config);
  (engine as unknown as { client: unknown }).client = client;
  return engine;
}

test("getConflicts reads wrapped daemon conflicts", async () => {
  const conflict = {
    path: "settings.json",
    localHash: "local",
    remoteHash: "remote",
    localModifiedAt: 1,
    remoteModifiedAt: 2,
    localDeviceName: "Fiddler",
    remoteDeviceName: "Hermit",
    localContent: "{}",
    remoteContent: "{\"theme\":\"dark\"}",
  };

  const engine = engineWithClient({
    sendCommand: async () => ({ conflicts: [conflict] }),
  });

  assert.deepEqual(await engine.getConflicts(), [conflict]);
});

test("resolveConflict returns daemon resolution result", async () => {
  const engine = engineWithClient({
    sendCommand: async () => ({ resolved: true, remaining: 0 }),
  });

  assert.deepEqual(await engine.resolveConflict("settings.json", "local"), {
    resolved: true,
    remaining: 0,
  });
});

test("syncNow waits for sync-complete when sync is queued", async () => {
  const engine = engineWithClient({
    sendCommand: async () => ({ ok: true, queued: true, connectedPeers: 1 }),
    waitForEvent: async () => ({ event: "sync-complete", synced: 3, conflicts: 1 }),
  });

  assert.deepEqual(await engine.syncNow(), { synced: 3, conflicts: 1 });
});

test("syncNow completes immediately without peers", async () => {
  const engine = engineWithClient({
    sendCommand: async () => ({ ok: true, queued: false, connectedPeers: 0 }),
    waitForEvent: async () => {
      throw new Error("should not be required");
    },
  });

  assert.deepEqual(await engine.syncNow(), { synced: 0, conflicts: 0 });
});
