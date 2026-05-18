# CrabTalk Runbook

Comprehensive guide to deploying, configuring, and operating CrabTalk.

## Architecture Overview

```
┌──────────────┐   HTTPS rendezvous    ┌───────────────────┐   HTTPS rendezvous ┌──────────────┐
│  Machine A   │◄─────────────────────►│ Rendezvous Server │◄──────────────────►│  Machine B   │
│              │                       │  (Neon + Hono)    │                    │              │
│  MCP Server  │                       │  BetterAuth       │                    │  MCP Server  │
│  + Daemon    │◄──────────────────────┼───────────────────┼───────────────────►│  + Daemon    │
│  + notify    │       libp2p QUIC     │                   │      libp2p QUIC   │  + notify    │
└──────────────┘    (encrypted P2P)    └───────────────────┘   (encrypted P2P)  └──────────────┘
```

**Data flow:**
1. Each daemon registers its libp2p listen addresses with the rendezvous server over HTTPS
2. The rendezvous server authenticates requests via BetterAuth bearer session tokens
3. Daemons fetch recently seen peers for the same user and dial them directly
4. Machines establish encrypted libp2p QUIC streams
5. File manifests are exchanged, diffs computed, files transferred
6. The rendezvous server never sees file contents

## Prerequisites

- Node.js >= 18
- A [Neon](https://neon.tech) PostgreSQL database
- A domain or host for the rendezvous server (Cloudflare Workers, Railway, Fly, etc.)

## 1. Database Setup (Neon)

### Create the database

1. Sign up at [neon.tech](https://neon.tech)
2. Create a new project named `crabtalk`
3. Copy the connection string — it looks like:
   ```
   postgresql://user:password@ep-something.us-east-2.aws.neon.tech/crabtalk?sslmode=require
   ```

### Run migrations

```bash
cd server
cp .env.example .env
# Edit .env — set DATABASE_URL to your Neon connection string
npm install
npx drizzle-kit push
```

This creates the tables: `users`, `sessions`, `accounts`, `verifications`, `peers`.

### Verify

```bash
# Connect to your Neon database and check tables exist
npx drizzle-kit studio
```

## 2. Google OAuth Setup (Optional)

Skip this section if you only want email/password auth.

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services > Credentials**
4. Click **Create Credentials > OAuth 2.0 Client ID**
5. Application type: **Web application**
6. Authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (development)
   - `https://your-signal-server.com/api/auth/callback/google` (production)
7. Copy the **Client ID** and **Client Secret**
8. Add to your `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id-here
   GOOGLE_CLIENT_SECRET=your-client-secret-here
   ```

## 3. Signal Server Deployment

### Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | No | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | Google OAuth client secret |
| `TRUSTED_ORIGINS` | Yes | Comma-separated allowed CORS origins (HTTPS in production) |

Variables are set as **Wrangler secrets** in production and in a `.dev.vars` file for local development (see `server/.env.example`).

### Local development

```bash
cd server
npm install
# Create server/.dev.vars from server/.env.example and fill in values
npm run dev
```

Verify: `curl http://localhost:8787/health` should return `{"status":"alive","service":"crabtalk-signal"}`.

### Production deployment (Cloudflare Workers)

```bash
cd server
npm install
wrangler secret put DATABASE_URL
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put TRUSTED_ORIGINS
npm run deploy
```

The first deploy automatically creates the `SignalingRoom` Durable Object class. Subsequent deploys are zero-downtime rolling updates.

Add your authorized redirect URI in Google Cloud Console:
- `https://crabtalk-signal.<your-account>.workers.dev/api/auth/callback/google`

### Verify deployment

```bash
curl https://your-signal-server.com/health
# Expected: {"status":"alive","service":"crabtalk-signal"}
```

## 4. Auth Pages (Cloudflare Pages)

BetterAuth handles the API routes (`/api/auth/*`) but you need a frontend page for browser-based login.

### Deploy to Cloudflare Pages

1. In `static/index.html`, update the `API` constant at the top of the `<script>` block to your signal server URL
2. In `static/_headers`, update the `connect-src` directive to match the same URL
3. In Cloudflare Pages: connect your repo, set build command to *(none)*, output directory to `static`
4. Add your Cloudflare Pages URL to `TRUSTED_ORIGINS` on the signal server

### Verify

Open your Cloudflare Pages URL in a browser. You should see the CrabTalk login card.

## 5. Plugin Installation

### For development / testing

```bash
claude --plugin-dir "C:\Users\Spork\dev\crabtalk"
```

### For permanent installation

Copy or symlink the plugin into your Claude Code plugins directory, or publish to the marketplace.

### Required environment variables on client

| Variable | Required | Description |
|----------|----------|-------------|
| `CRABTALK_SIGNAL_URL` | Yes | URL of your deployed signal server |
| `CRABTALK_AUTH_TOKEN` | No | Set automatically after `/crabtalk:setup` |

Set before launching Claude Code:

```powershell
# PowerShell
$env:CRABTALK_SIGNAL_URL = "https://your-signal-server.com"
claude --plugin-dir "C:\Users\Spork\dev\crabtalk"
```

```bash
# Bash
export CRABTALK_SIGNAL_URL="https://your-signal-server.com"
claude --plugin-dir /path/to/crabtalk
```

## 6. First-Time Device Setup

1. Start Claude Code with the plugin loaded
2. Run `/crabtalk:setup`
3. A browser window opens to the auth page
4. Log in or create an account (email/password or Google)
5. The MCP server registers this device with a random crab name
6. Configuration saved to `~/.claude/crabtalk.json`

### Verify setup

Run `/crabtalk:status`. You should see:
- Your device's crab name
- Signal server: Connected
- Auth status: Valid

## 7. Connecting a Second Device

1. Install the plugin on the second machine (same steps as above)
2. Run `/crabtalk:setup` and log in with the **same account**
3. The second device gets a different crab name
4. Both devices should appear in each other's `/crabtalk:status`
5. Initial sync triggers automatically — manifests are exchanged and files transferred

## 8. Day-to-Day Usage

### Sync happens automatically

- File changes in watched paths are detected by the Rust `notify` watcher
- Changes are batched (3-second debounce) and pushed to connected peers
- No manual action needed for normal operation

### Check status

```
/crabtalk:status
```

Shows connected peers, last sync time, pending changes, unresolved conflicts.

### Resolve conflicts

```
/crabtalk:conflicts
```

Shows unified diffs for each conflicting file. Options:
- **Keep local** — your version wins, pushed to remote
- **Keep remote** — accept the other device's version
- **Manual merge** — edit the file yourself, then confirm

### Force sync

Use the `sync-now` MCP tool if you want to trigger an immediate manifest exchange without waiting for the file watcher.

## 9. What Syncs

| Path | Content |
|------|---------|
| `~/.claude/plugins/` | Installed plugins |
| `~/.claude/agents/` | Custom agent definitions |
| `~/.claude/settings.json` | Preferences, statusline config |
| `~/.claude/CLAUDE.md` | Global user instructions |
| `~/.claude/keybindings.json` | Custom keyboard shortcuts |

### Excluded

- Conversation history and caches
- Auth tokens (`credentials.json`, session tokens)
- Per-project `.local.md` files
- Temp files and session state
- `crabtalk.json` (device-specific config)

## 10. Troubleshooting

### MCP server shows "failed" in `/mcp`

**Cause:** Usually missing `CRABTALK_SIGNAL_URL` environment variable.

**Fix:** Set the env var before launching Claude Code:
```powershell
$env:CRABTALK_SIGNAL_URL = "https://your-signal-server.com"
```

### "CrabTalk is installed but not configured"

**Cause:** No `~/.claude/crabtalk.json` file.

**Fix:** Run `/crabtalk:setup` to authenticate and register this device.

### Auth token expired

**Cause:** BetterAuth session expired.

**Fix:** Run `/crabtalk:setup` again to re-authenticate.

### Rendezvous server unreachable

**Cause:** Network issue or server is down.

**Fix:**
1. Check the rendezvous server health: `curl https://your-rendezvous-server.com/health`
2. Verify `CRABTALK_SIGNAL_URL` is correct
3. Check firewall/proxy settings

### Peers can't establish P2P connection

**Cause:** Restrictive NAT or corporate firewall blocking direct libp2p QUIC traffic.

**Fix:** CrabTalk intentionally does not use TURN relay servers. Options:
- Use a VPN to put both devices on the same network
- Check that UDP traffic is not blocked by your firewall
- Try from a less restrictive network

### Sync not happening

1. Run `/crabtalk:status` — verify both devices show as connected
2. Check that both devices are signed into the same CrabTalk account
3. Verify the MCP server is running (`/mcp`)
4. Restart Claude Code with `claude --debug` for detailed logs

### Unexpected conflicts

**Cause:** Same file modified on both devices between syncs. More common when devices were offline and accumulated divergent changes.

**Fix:** Run `/crabtalk:conflicts` and resolve each one. To minimize future conflicts, keep both devices online when making config changes.

### Config file corrupt

**Cause:** `~/.claude/crabtalk.json` has invalid JSON.

**Fix:** Delete the file and re-run `/crabtalk:setup`:
```bash
rm ~/.claude/crabtalk.json
```

## 11. Security Model

| Layer | Protection |
|-------|-----------|
| Authentication | BetterAuth email/password sessions |
| Session management | BetterAuth session tokens with expiry |
| Transport encryption | libp2p QUIC encrypted streams |
| Data routing | P2P only — rendezvous server never sees file contents |
| Peer isolation | Rendezvous server scopes peers by user ID |
| Excluded from sync | Auth tokens, credentials, session state |

### What the rendezvous server knows

- Your email and account info (BetterAuth)
- Recently registered devices and libp2p multiaddrs

### What the rendezvous server does NOT know

- Contents of any synced files
- What's in your `.claude` directory
- Your Claude Code conversations

## 12. Development

### Project structure

```
crabtalk/
├── .claude-plugin/plugin.json   Plugin manifest
├── .mcp.json                    MCP server config
├── skills/                      4 skills (setup, conflicts, status, sync-guide)
├── hooks/hooks.json             SessionStart auto-connect
├── scripts/session-start.js     Hook script
├── mcp-server/                  Claude-facing MCP bridge (TypeScript)
│   └── src/
│       ├── index.ts             MCP tool definitions + server entry
│       ├── daemon-client.ts     IPC client for the Rust daemon
│       ├── sync-engine.ts       Maps MCP tools to daemon commands
│       ├── diff-util.ts         Unified diff generation
│       └── types.ts             Shared type definitions
├── daemon/                      Rust libp2p sync daemon
│   └── src/
│       ├── main.rs              Daemon bootstrap
│       ├── watcher.rs           File watching with batching
│       ├── network.rs           libp2p QUIC swarm
│       ├── sync.rs              Manifest exchange and file transfer
│       ├── ipc.rs               MCP IPC server
│       └── rendezvous.rs        Rendezvous API client
└── server/                      Rendezvous server (TypeScript)
    └── src/
        ├── index.ts             Hono HTTP server
        ├── auth.ts              BetterAuth configuration
        ├── rendezvous.ts        Peer registration and discovery
        └── db/
            ├── schema.ts        Drizzle ORM table definitions
            └── index.ts         Neon database connection
```

### Building

```bash
# MCP server
cd mcp-server && npm install && npm run build

# Signal server
cd server && npm install && npm run build
```

### Running locally

```bash
# Terminal 1: Signal server (Wrangler dev mode)
cd server && npm run dev

# Terminal 2: Claude Code with plugin
export CRABTALK_SIGNAL_URL=http://localhost:8787
claude --plugin-dir /path/to/crabtalk
```

### Database migrations

```bash
cd server
npm run db:push    # Push schema to database
npm run db:studio  # Visual database browser
```

## 13. Crab Species Names

Devices are assigned random names from this list on first setup:

Fiddler, Hermit, Dungeness, King, Spider, Coconut, Horseshoe, Blue, Snow, Stone, Mud, Ghost, Porcelain, Pea, Sally Lightfoot, Japanese Spider, Decorator, Boxing, Yeti, Vampire

If you don't like your crab, delete `~/.claude/crabtalk.json` and re-run `/crabtalk:setup` for a new roll of the dice.
