# CrabTalk

P2P sync for your `.claude` configuration across machines. No central server touches your file contents — devices discover each other through the rendezvous API and exchange files directly over encrypted libp2p QUIC streams.

## What Syncs

- Installed plugins (`~/.claude/plugins/`)
- Custom agents (`~/.claude/agents/`)
- Settings & statusline (`~/.claude/settings.json`)
- Global instructions (`~/.claude/CLAUDE.md`)
- Keybindings (`~/.claude/keybindings.json`)

## What Doesn't Sync

Conversation history, caches, auth tokens, `.local.md` files, temp files.

## Architecture

- **Auth**: BetterAuth email/password sessions backed by Neon PostgreSQL
- **Rendezvous**: Hono API for authenticated peer registration and discovery
- **Transport**: libp2p QUIC with request/response streams for direct P2P file transfer
- **Conflict resolution**: Unified diffs flagged for user resolution via `/crabtalk:conflicts`

## Structure

```
crabtalk/
├── .claude-plugin/     # Plugin manifest
├── skills/             # User-facing skills (setup, conflicts, status, sync-guide)
├── hooks/              # SessionStart auto-connect
├── mcp-server/         # MCP server — daemon IPC bridge and Claude-facing tools
├── daemon/             # Rust libp2p daemon — watching, peer connections, file transfer
└── server/             # Rendezvous server — auth and peer discovery
```

## Setup

```bash
# Install the plugin
claude --plugin-dir /path/to/crabtalk

# Create an account or log in
# Use /crabtalk:setup in a Claude Code session
```

## Skills

| Skill | Description |
|-------|-------------|
| `/crabtalk:setup` | Create account or log in, configure device |
| `/crabtalk:conflicts` | View and resolve sync conflicts (unified diff) |
| `/crabtalk:status` | See connected peers, last sync, pending changes |

## License

MIT
