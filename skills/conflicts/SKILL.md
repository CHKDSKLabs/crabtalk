---
name: crabtalk-conflicts
description: This skill should be used when the user asks to "resolve crabtalk conflicts", "show sync conflicts", "fix crabtalk conflicts", "view config diffs", "crabtalk conflicts", or mentions merge conflicts from CrabTalk sync.
argument-hint: [file path (optional)]
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - mcp__plugin_crabtalk_crabtalk__*
---

# CrabTalk Conflict Resolution

Display and resolve sync conflicts detected by CrabTalk between peer devices.

## Prerequisites

Check that `~/.claude/crabtalk.json` exists. If it does not, inform the user to run `/crabtalk:setup` first and stop.

## Conflict Detection

CrabTalk flags a conflict when the same file has been modified on two or more peers since their last successful sync. Conflicts are stored by the MCP server and retrievable via the `list-conflicts` tool.

## Resolution Flow

### Step 1: List Conflicts

Use the `list-conflicts` MCP tool to retrieve all unresolved conflicts. If a specific file path argument was provided, filter to that file only.

For each conflict, display:
- **File path** (relative to `~/.claude/`)
- **Local device name** and modification timestamp
- **Remote device name** and modification timestamp

If no conflicts exist, inform the user that everything is in sync.

### Step 2: Show Unified Diff

For each conflict (or the user-specified file), read both versions and generate a unified diff:

```bash
diff -u <local_version> <remote_version>
```

Present the diff with clear labels indicating which device produced each version. Format as a fenced code block with `diff` syntax highlighting.

### Step 3: User Resolution

For each conflict, present three options:

1. **Keep local** — preserve this device's version, push to remote
2. **Keep remote** — accept the remote device's version
3. **Manual merge** — the user will edit the file themselves, then confirm

Ask the user which option to take. Wait for their response before proceeding.

### Step 4: Apply Resolution

Based on the user's choice:

- **Keep local**: Use `resolve-conflict` MCP tool with `resolution: "local"`
- **Keep remote**: Use `resolve-conflict` MCP tool with `resolution: "remote"`, then write the remote content to the local file
- **Manual merge**: Let the user edit the file. After they confirm, use `resolve-conflict` with `resolution: "manual"` and the current file contents

### Step 5: Confirm

After resolution, use `list-conflicts` again to confirm the conflict is cleared. Report remaining conflict count if any.

## Batch Resolution

If multiple conflicts exist and the user wants to resolve them all at once with the same strategy (e.g., "keep all local"), iterate through each conflict applying the chosen resolution. Confirm the batch operation before executing.
