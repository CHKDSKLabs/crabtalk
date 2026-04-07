---
name: setup
description: Run this command when the user asks to "set up crabtalk", "connect crabtalk", "log in to crabtalk", "authenticate crabtalk", "configure sync", or "link my devices".
argument-hint: (no arguments)
allowed-tools:
  - Bash
  - Read
---

# CrabTalk Setup

Run the CrabTalk setup script to authenticate this device and register it as a sync peer.

## Steps

1. Check if `~/.claude/crabtalk.json` already exists and contains a valid `authToken` and `deviceName`. If it does, inform the user they are already configured and skip to step 3.

2. If not configured, run the setup script using the Bash tool:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs"
   ```
   The script will open a browser to the auth page, prompt for a token, validate it, and write the config file.

3. After setup completes (or if already configured), remind the user to restart Claude Code for the CrabTalk MCP server to connect.
