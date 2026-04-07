## L1-1 Complete
- .gitignore: static/.wrangler/ excluded (Cloudflare account ID no longer tracked)
- .mcp.json: args point to scripts/start.mjs; CRABTALK_AUTH_TOKEN env var removed
- .claude-plugin/plugin.json: repository and homepage fields added

## L3-1 Complete
- server/src/index.ts: forwardRef import removed
- server/src/index.ts: /setup route added (session-gated token display page)
- Unauthenticated: redirects to /api/auth/sign-in?callbackURL=/setup
- Authenticated: renders token for copy-paste into CLI setup prompt

## L1-2 Complete
- scripts/start.mjs created: auto-bootstrapping launcher for MCP server
- First run: ~30-60s (npm install + tsc build); subsequent runs: instant
- stdio: 'inherit' preserves MCP stdio pipe

## L5-1 Complete
- commands/setup.md created: /setup slash command replaces setup skill
- scripts/setup.mjs: AUTH_URL fixed to https://claw.crabtalk.dev/setup
- skills/setup/SKILL.md deleted: wrong UX primitive removed

## L4-1 Complete
- mcp-server/src/sync-engine.ts: authValid no longer hardcoded
- validateAuth() fetches /api/auth/get-session at startup; result cached in this.authValid
- getStatus() now returns real auth state
