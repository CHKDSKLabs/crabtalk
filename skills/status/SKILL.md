---
name: crabtalk-status
description: This skill should be used when the user asks to "check crabtalk status", "show sync status", "list connected devices", "crabtalk peers", "who's online", "last sync time", or mentions CrabTalk connection or device status.
argument-hint: (no arguments)
allowed-tools:
  - mcp__plugin_crabtalk_crabtalk__*
---

# CrabTalk Status

Display the current state of CrabTalk P2P sync.

## Prerequisites

Check that `~/.claude/crabtalk.json` exists. If it does not, inform the user to run `/crabtalk:setup` first and stop.

## Status Report

Use the `get-status` MCP tool to retrieve the full sync state and present it in this format:

### Connection

- **This device**: {device crab name}
- **Signal server**: Connected / Disconnected
- **Auth status**: Valid / Expired

### Online Peers

Display a table of currently connected peers:

| Device | Status | Last Seen |
|--------|--------|-----------|
| Hermit | Connected (direct P2P) | now |
| Dungeness | Connected (direct P2P) | now |
| Fiddler | Offline | 2h ago |

### Sync State

- **Last sync**: {timestamp}
- **Pending local changes**: {count} files
- **Pending remote changes**: {count} files
- **Unresolved conflicts**: {count} (use `/crabtalk:conflicts` to resolve)

### Watched Paths

List the paths currently being monitored for changes:
- `~/.claude/plugins/`
- `~/.claude/agents/`
- `~/.claude/settings.json`
- `~/.claude/CLAUDE.md`
- `~/.claude/keybindings.json`

