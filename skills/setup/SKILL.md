---
name: CrabTalk Setup
description: This skill should be used when the user asks to "set up crabtalk", "connect crabtalk", "log in to crabtalk", "create a crabtalk account", "configure sync", "link my devices", or mentions CrabTalk authentication or device pairing.
argument-hint: (no arguments)
allowed-tools:
  - Bash
  - Read
  - Write
  - WebSearch
  - mcp__plugin_crabtalk_crabtalk__*
---

# CrabTalk Setup

Configure CrabTalk P2P sync for this device. This involves authenticating with the CrabTalk signal server and registering this device as a peer.

## Prerequisites

Verify the CrabTalk MCP server is running by checking available tools. If not running, inform the user to restart Claude Code with the CrabTalk plugin installed.

## Setup Flow

### Step 1: Check Existing Configuration

Read `~/.claude/crabtalk.json` to determine if this device is already configured. If the file exists and contains a valid auth token and device name, skip to Step 4 (verify connection).

### Step 2: Authenticate

Open the user's browser to the CrabTalk auth page for login or account creation:

```bash
# macOS
open "${CRABTALK_SIGNAL_URL}/auth/login"

# Linux
xdg-open "${CRABTALK_SIGNAL_URL}/auth/login"

# Windows
start "${CRABTALK_SIGNAL_URL}/auth/login"
```

The auth page supports email/password and Google OAuth via BetterAuth. After authentication, the browser redirects with a session token. The MCP server handles the token exchange automatically.

Inform the user to complete authentication in their browser and confirm when done.

### Step 3: Register Device

After authentication, use the MCP server's `register-device` tool. The server assigns this peer a random crab species name (Fiddler, Hermit, Dungeness, King, Spider, Coconut, Horseshoe, Blue, etc.).

Save the configuration to `~/.claude/crabtalk.json`:

```json
{
  "deviceName": "Fiddler",
  "userId": "<assigned-user-id>",
  "signalUrl": "<signal-server-url>",
  "authToken": "<session-token>",
  "syncPaths": [
    "plugins/",
    "agents/",
    "settings.json",
    "CLAUDE.md",
    "keybindings.json"
  ]
}
```

### Step 4: Verify Connection

Use the MCP server's `get-status` tool to confirm:
- Authentication is valid
- Signal server connection is established
- Device is registered and visible to other peers

Report the device name and any other online peers to the user.

### Step 5: Initial Sync

If other peers are online, trigger an initial manifest exchange using the `sync-now` tool. Report what was synced or if any conflicts were detected.

## Troubleshooting

- **MCP server not running**: Restart Claude Code with the plugin directory specified
- **Auth token expired**: Re-run setup to re-authenticate
- **Signal server unreachable**: Check network connectivity and `CRABTALK_SIGNAL_URL` environment variable
- **Browser doesn't open**: Manually navigate to the auth URL printed in the terminal
