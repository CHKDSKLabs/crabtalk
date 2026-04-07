# CrabTalk Auth Page Redesign — Design Spec

**Date:** 2026-04-06  
**Status:** Approved  

## Overview

Redesign the `static/index.html` auth page from a bare unstyled stub into a polished, on-brand page ready for Cloudflare Pages deployment. The page is developer-facing — users authenticate here to get a session token for the CrabTalk Claude Code plugin.

## Goals

- Replace the unstyled HTML stub with a production-quality page
- Fix the missing Google button bug (JS referenced `#google` but the element didn't exist — removing Google auth per scope decision, email/password only)
- Prep for Cloudflare Pages deployment with a `_headers` security file
- Establish CrabTalk's visual identity: dark, warm, crab-themed ("Crab Shack" aesthetic)

## Out of Scope

- Google OAuth (removed — email/password only)
- Sign-up flow (auth page is login only; account creation is out of scope)
- Build tooling or bundlers — single self-contained HTML file
- Animations or interactive crab elements

## File Structure

```
static/
├── index.html    # complete self-contained app (HTML + inline CSS + inline JS)
└── _headers      # Cloudflare Pages security headers
```

No `wrangler.toml` required. Cloudflare Pages deployment config: build command = none, output directory = `static`.

## Page States

### State 1: Login

Centered card on dark background. Components top-to-bottom:

1. `🦀` emoji at `4rem`
2. "CrabTalk" wordmark (`h1`, amber accent color)
3. Muted subtitle: "Authenticate to get a session token for your Claude Code plugin"
4. Email input
5. Password input
6. Full-width "Log In" submit button (amber)
7. Error message slot (hidden until needed, red text, no reload)

### State 2: Success

The card's inner content is swapped in-place via JS (no navigation, no page reload) to show:

1. "Authenticated." heading
2. Token displayed in a monospace block with amber border and a "Copy" button — clicking copies to clipboard and briefly changes the button label to "Copied!" for ~1.5s, then reverts
3. Instruction text: `Copy this token into your /crabtalk:setup session.`

### Error Handling

- HTTP errors or missing token in response: show `#f85149` error text below the form
- No page reload on error — inline only

## Visual Design

| Token | Value |
|-------|-------|
| Page background | `#0d1117` |
| Card background | `#161b22` |
| Card border | `1px solid #30363d` |
| Card border-radius | `12px` |
| Accent (amber) | `#e8851a` |
| Primary text | `#e6edf3` |
| Muted text | `#8b949e` |
| Error text | `#f85149` |
| Button hover | `#d4760f` (amber darkened) |
| Input background | `#0d1117` |
| Input border | `#30363d` |
| Input focus ring | `2px solid #e8851a` |
| Font (UI) | Inter (Google Fonts CDN), fallback sans-serif |
| Font (token) | `'Courier New', monospace` |
| Button border-radius | `6px` |
| Crab | `🦀` emoji, `4rem`, no animation |

## Config Block

At the top of the inline `<script>`, clearly delimited:

```js
// ─── CONFIGURE BEFORE DEPLOY ──────────────────────────────
const API = 'https://your-signal-server.com';
// ──────────────────────────────────────────────────────────
```

Deployer replaces the URL before pushing. No environment variable injection, no build step.

## Security Headers (`_headers`)

Applied to `/*` via Cloudflare Pages `_headers` file:

- `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' https://your-signal-server.com`
- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

Note: `unsafe-inline` is required for inline `<style>` and `<script>`. The CSP `connect-src` directive must be updated alongside the `API` config block when deploying.

## Deployment Steps

1. Edit `API` constant and `connect-src` in `_headers` to match the deployed signal server URL
2. Push `static/` to GitHub (or connect repo directly to Cloudflare Pages)
3. In Cloudflare Pages: set build command to none, output directory to `static`
4. Add the Cloudflare Pages URL to `TRUSTED_ORIGINS` on the signal server
