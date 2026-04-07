# CrabTalk Marketing Site Design

**Date:** 2026-04-06
**Status:** Approved

## Overview

A lean, single-page explainer site for CrabTalk, targeting Claude Code power users. Primary goal: get visitors to install the plugin. Lives in `marketing/index.html`, deployed to `crabtalk.dev` separately from the auth server at `claw.crabtalk.dev`.

## File Layout

```
marketing/
└── index.html   # Self-contained, no build step
```

No external dependencies beyond Google Fonts (Inter). CRABTALK.svg referenced from `../static/assets/CRABTALK.svg` during dev; deployment config adjusts asset paths for production.

## Sections

### 1. Hero
- Logo (CRABTALK.svg, 80px)
- Headline: "Your Claude Code config, everywhere you work."
- Subhead: "CrabTalk syncs plugins, agents, settings, and instructions across your machines — directly, peer-to-peer, no cloud in the middle."
- CTA button: "Get Started" → smooth scrolls to install section

### 2. What Syncs
- Compact grid of 5 badge-style chips
- Items: Plugins, Agents, Settings & statusline, CLAUDE.md, Keybindings
- Each shows the resolved path (e.g. `~/.claude/plugins/`)

### 3. How It Works
- 3 numbered steps, text-only, no images
- Step 1: Install the plugin into Claude Code
- Step 2: Run `/crabtalk:setup` and authenticate at `claw.crabtalk.dev`
- Step 3: Open Claude Code on another machine and repeat — peers find each other automatically

### 4. Install CTA
- Section anchor (`#install`)
- Copyable code block: `claude --plugin-dir /path/to/crabtalk`
- Note: "Then run `/crabtalk:setup` in any Claude Code session to link your account."
- Secondary link to `claw.crabtalk.dev` for authentication

### 5. Footer
- "Made by CHKDSK Labs" → `https://chkdsklabs.io`
- "Buy me a coffee" → `https://buymeacoffee.com/jayub`

## Style

Matches existing brand exactly:
- Background: `#0d1117`
- Card/surface: `#161b22`
- Border: `#30363d`
- Accent (orange): `#e8851a`
- Text primary: `#e6edf3`
- Text muted: `#8b949e`
- Font: Inter (Google Fonts), weights 400/500/600
- Full-width landing page layout (not the centered card from the auth page)

## Deployment

- Target URL: `crabtalk.dev`
- Deployed via Cloudflare Pages or Workers Static Assets (separate from the signal server)
- No build step required

## Out of Scope

- Screenshots or demo videos
- FAQ section
- Pricing or comparison table
- Docs pages
