---
name: CrabTalk Sync Guide
description: This skill should be used when the user asks "how does crabtalk work", "what does crabtalk sync", "crabtalk architecture", "crabtalk troubleshooting", "sync not working", "crabtalk help", or has questions about CrabTalk's sync mechanism, security, or behavior.
argument-hint: (no arguments)
allowed-tools:
  - Read
  - mcp__plugin_crabtalk_crabtalk__*
---

# CrabTalk Sync Guide

CrabTalk provides peer-to-peer configuration sync between machines running Claude Code. No central server ever touches file contents — data flows directly between devices over encrypted WebRTC data channels.

## What Syncs

| Path | Content |
|------|---------|
| `~/.claude/plugins/` | Installed plugins |
| `~/.claude/agents/` | Custom agent definitions |
| `~/.claude/settings.json` | Preferences, statusline config |
| `~/.claude/CLAUDE.md` | Global user instructions |
| `~/.claude/keybindings.json` | Custom keyboard shortcuts |

## What Does NOT Sync

- Conversation history and caches
- Authentication tokens (`credentials.json`, etc.)
- Per-project `.local.md` files
- Temp files and session state

## How It Works

### Architecture

1. **BetterAuth + Neon PostgreSQL** handles user accounts (email/password or Google OAuth)
2. **Signal server** (Neon serverless, Cloudflare Workers if needed) brokers peer discovery and WebRTC handshake — it never sees file contents
3. **WebRTC data channels** carry file data directly between peers, encrypted via DTLS
4. **MCP server** (runs locally during Claude Code session) manages file watching, sync logic, and conflict detection

### Sync Protocol

Each peer maintains a manifest: a map of file paths to content hashes and modification timestamps. When peers connect:

1. Exchange manifests
2. Diff to find files that changed on one or both sides
3. Transfer changed files directly over WebRTC data channel
4. If the same file changed on both peers since last sync, flag as conflict

Changes are batched on a short interval (a few seconds) to avoid thrashing during rapid edits.

### Conflict Resolution

A conflict occurs when the same file is modified on two devices between syncs. CrabTalk never silently overwrites — conflicts are flagged for user resolution via `/crabtalk:conflicts`, which shows unified diffs and lets the user choose: keep local, keep remote, or manually merge.

### Security

- **Transport encryption**: WebRTC data channels use mandatory DTLS encryption
- **No data on server**: The signal server only relays WebRTC signaling metadata (SDP offers/answers, ICE candidates). File contents never leave the P2P channel.
- **Authentication**: BetterAuth session tokens validate peer identity through the signal server
- **No TURN fallback**: Data always flows peer-to-peer. If NAT prevents direct connection, sync will not fall back to relaying through a server.

### Peer Discovery

- Each device registers with the signal server via WebSocket
- Signal server maintains presence for each user ID
- When a new peer comes online, existing peers are notified
- WebRTC handshake is brokered through the signal server
- After handshake, communication is direct P2P
- Heartbeat every 30 seconds to maintain presence

### Device Names

Each device is assigned a random crab species name on first setup (Fiddler, Hermit, Dungeness, King, Spider, Coconut, Horseshoe, Blue, etc.). These names are used in status displays and conflict reports to identify which device made which change.

## Troubleshooting

### Sync Not Working

1. Check status with `/crabtalk:status` — verify signal server connection
2. Ensure both devices are online and signed into the same CrabTalk account
3. Confirm the MCP server is running (restart Claude Code if needed)
4. Check network — WebRTC requires peers to establish a direct connection. Restrictive NATs or corporate firewalls may block this.

### Conflicts Appearing Unexpectedly

Conflicts happen when the same file changes on multiple devices between syncs. If devices are both online, syncs happen frequently and conflicts are rare. Conflicts are more likely when devices were offline and accumulated divergent changes.

### Auth Token Expired

Re-run `/crabtalk:setup` to re-authenticate.

### MCP Server Not Starting

Ensure `CRABTALK_SIGNAL_URL` environment variable is set. Check Claude Code debug output with `claude --debug`.
