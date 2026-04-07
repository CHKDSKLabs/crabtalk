# CrabTalk

P2P sync for your `.claude` configuration across machines. No central server touching your data — just WebRTC between your own devices.

## What Syncs

- Installed plugins (`~/.claude/plugins/`)
- Custom agents (`~/.claude/agents/`)
- Settings & statusline (`~/.claude/settings.json`)
- Global instructions (`~/.claude/CLAUDE.md`)
- Keybindings (`~/.claude/keybindings.json`)

## What Doesn't Sync

Conversation history, caches, auth tokens, `.local.md` files, temp files.

## Architecture

- **Auth**: BetterAuth (email/password + Google OAuth) backed by Neon PostgreSQL
- **Signaling**: WebSocket signal server for peer discovery and WebRTC handshake
- **Transport**: WebRTC data channels (DTLS encrypted) for direct P2P file transfer
- **Conflict resolution**: Unified diffs flagged for user resolution via `/crabtalk:conflicts`

## Structure

```
crabtalk/
├── .claude-plugin/     # Plugin manifest
├── skills/             # User-facing skills (setup, conflicts, status, sync-guide)
├── hooks/              # SessionStart auto-connect
├── mcp-server/         # MCP server — sync engine, WebRTC, file watching
└── server/             # Signal server — auth, peer discovery, signaling
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
