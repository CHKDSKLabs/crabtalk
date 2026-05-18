import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { readFile, writeFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { createDiff } from "./diff-util.js";
import { SyncEngine } from "./sync-engine.js";
import { CRAB_SPECIES } from "./types.js";
import type { CrabTalkConfig } from "./types.js";

const CONFIG_PATH = join(homedir(), ".claude", "crabtalk.json");

const DEFAULT_SYNC_PATHS = [
  "plugins/",
  "agents/",
  "settings.json",
  "CLAUDE.md",
  "keybindings.json",
];

let engine: SyncEngine | null = null;

function loadConfig(): CrabTalkConfig | null {
  if (!existsSync(CONFIG_PATH)) return null;
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    return raw as CrabTalkConfig;
  } catch {
    return null;
  }
}

function randomCrabName(): string {
  return CRAB_SPECIES[Math.floor(Math.random() * CRAB_SPECIES.length)];
}

async function ensureEngine(): Promise<SyncEngine | null> {
  if (engine) return engine;

  const config = loadConfig();
  if (!config) return null;

  try {
    engine = new SyncEngine(config);
    await engine.start();
    return engine;
  } catch {
    engine = null;
    return null;
  }
}

const server = new McpServer({
  name: "crabtalk",
  version: "0.1.0",
});

server.registerTool(
  "register-device",
  {
    description:
      "Register this device with CrabTalk. Assigns a crab species name and saves config.",
    inputSchema: z.object({
      signalUrl: z.string().describe("Signal server URL"),
      authToken: z.string().describe("Auth token from BetterAuth login"),
      userId: z.string().describe("User ID from auth"),
    }),
  },
  async ({ signalUrl, authToken, userId }) => {
    const deviceName = randomCrabName();

    const config: CrabTalkConfig = {
      deviceName,
      userId,
      signalUrl,
      authToken,
      syncPaths: DEFAULT_SYNC_PATHS,
    };

    await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

    try {
      engine = new SyncEngine(config);
      await engine.start();
    } catch {
      engine = null;
      return {
        content: [
          {
            type: "text" as const,
            text: [
              `Device registered as "${deviceName}". Config saved to ${CONFIG_PATH}.`,
              ``,
              `To start syncing, run the CrabTalk daemon:`,
              `  crabtalk-daemon`,
              ``,
              `Or if installed to ~/.claude/bin:`,
              `  ~/.claude/bin/crabtalk-daemon`,
            ].join("\n"),
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: `Device registered as "${deviceName}". Config saved to ${CONFIG_PATH}. Connected to daemon.`,
        },
      ],
    };
  }
);

server.registerTool(
  "get-status",
  {
    description:
      "Get CrabTalk sync status: connection state, online peers, last sync time, pending changes, conflicts.",
    inputSchema: z.object({}),
  },
  async () => {
    if (!loadConfig()) {
      return {
        content: [
          {
            type: "text" as const,
            text: "CrabTalk is not configured. Run /crabtalk:setup first.",
          },
        ],
      };
    }

    const e = await ensureEngine();
    if (!e) {
      return {
        content: [
          {
            type: "text" as const,
            text: "CrabTalk daemon is not running. Start it with `crabtalk-daemon`.",
          },
        ],
      };
    }

    const status = await e.getStatus();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  }
);

server.registerTool(
  "list-conflicts",
  {
    description: "List all unresolved sync conflicts between peers.",
    inputSchema: z.object({
      filePath: z
        .string()
        .optional()
        .describe("Optional: filter to a specific file path"),
    }),
  },
  async ({ filePath }) => {
    if (!engine) {
      return {
        content: [
          { type: "text" as const, text: "CrabTalk is not running. Start the daemon with `crabtalk-daemon` first." },
        ],
      };
    }

    let conflicts = await engine.getConflicts();
    if (filePath) {
      conflicts = conflicts.filter((c) => c.path === filePath);
    }

    if (conflicts.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "No unresolved conflicts. Everything is in sync.",
          },
        ],
      };
    }

    const summaries = conflicts.map((c) => {
      const diff = createDiff(c.path, c.localContent, c.remoteContent);
      return [
        `## ${c.path}`,
        `Local (${c.localDeviceName}): modified ${new Date(c.localModifiedAt).toISOString()}`,
        `Remote (${c.remoteDeviceName}): modified ${new Date(c.remoteModifiedAt).toISOString()}`,
        "",
        "```diff",
        diff,
        "```",
      ].join("\n");
    });

    return {
      content: [
        {
          type: "text" as const,
          text: summaries.join("\n\n---\n\n"),
        },
      ],
    };
  }
);

server.registerTool(
  "resolve-conflict",
  {
    description:
      'Resolve a sync conflict for a specific file. Resolution: "local" (keep this device), "remote" (accept other device), or "manual" (provide merged content).',
    inputSchema: z.object({
      filePath: z.string().describe("Path of the conflicting file"),
      resolution: z
        .enum(["local", "remote", "manual"])
        .describe("Resolution strategy"),
      manualContent: z
        .string()
        .optional()
        .describe("Merged content (required if resolution is 'manual')"),
    }),
  },
  async ({ filePath, resolution, manualContent }) => {
    if (!engine) {
      return {
        content: [
          { type: "text" as const, text: "CrabTalk is not running. Start the daemon with `crabtalk-daemon` first." },
        ],
      };
    }

    const result = await engine.resolveConflict(filePath, resolution, manualContent);

    if (!result.resolved) {
      return {
        content: [
          {
            type: "text" as const,
            text: result.error || `No conflict found for ${filePath}.`,
          },
        ],
      };
    }

    const remaining = result.remaining ?? (await engine.getConflicts()).length;
    return {
      content: [
        {
          type: "text" as const,
          text: `Conflict resolved for ${filePath} (${resolution}). ${remaining} conflicts remaining.`,
        },
      ],
    };
  }
);

server.registerTool(
  "sync-now",
  {
    description:
      "Trigger an immediate sync with all connected peers. Exchanges manifests and transfers changed files.",
    inputSchema: z.object({}),
  },
  async () => {
    if (!loadConfig()) {
      return {
        content: [
          {
            type: "text" as const,
            text: "CrabTalk is not configured. Run /crabtalk:setup first.",
          },
        ],
      };
    }

    const e = await ensureEngine();
    if (!e) {
      return {
        content: [
          {
            type: "text" as const,
            text: "CrabTalk daemon is not running. Start it with `crabtalk-daemon`.",
          },
        ],
      };
    }

    const result = await e.syncNow();
    return {
      content: [
        {
          type: "text" as const,
          text: `Sync triggered. ${result.synced} files in manifest, ${result.conflicts} conflicts detected.`,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[CrabTalk] MCP server running on stdio");

  const config = loadConfig();
  if (config) {
    try {
      engine = new SyncEngine(config);
      await engine.start();
      console.error(`[CrabTalk] Connected to daemon as ${config.deviceName}`);
    } catch (err) {
      console.error("[CrabTalk] Daemon not running (tools still available, will connect on demand):", err);
      engine = null;
    }
  }
}

main().catch((err) => {
  console.error("[CrabTalk] Fatal error:", err);
  process.exit(1);
});
