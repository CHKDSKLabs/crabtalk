# CrabTalk Production Operator Steps

These steps require host, cloud, or account permissions that are not available inside the coding workspace.

## Local Rust Verification Prerequisite

The daemon crate requires a system C linker for Rust build scripts. On Debian/Ubuntu/WSL, install it with:

```bash
sudo apt-get update
sudo apt-get install -y build-essential pkg-config
```

Then verify the daemon:

```bash
cd daemon
cargo fmt -- --check
cargo test
cargo check
```

## Signal Server Deployment

1. Create or select the production Neon PostgreSQL database.
2. Set Cloudflare Worker secrets:

```bash
cd server
wrangler secret put DATABASE_URL
wrangler secret put TRUSTED_ORIGINS
wrangler secret put BETTER_AUTH_SECRET
wrangler secret put BETTER_AUTH_URL
```

3. If Google OAuth is enabled again later, also set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
4. Run the database schema push:

```bash
npm install
npm run db:push
```

5. Deploy and smoke test:

```bash
npm run deploy
curl https://<rendezvous-host>/health
```

Expected response:

```json
{"status":"alive","service":"crabtalk-signal"}
```

## Auth Page Deployment

Before deploying `static/`, set both deployment-specific URLs:

1. In `static/index.html`, set the `API` constant to the deployed rendezvous server URL.
2. In `static/_headers`, set `connect-src` to the same rendezvous server URL.
3. Deploy `static/` to Cloudflare Pages with no build command.
4. Add the Pages URL to `TRUSTED_ORIGINS` on the rendezvous server.

## Daemon Release

After daemon tests pass on a host with the Rust linker installed:

```bash
cd daemon
cargo build --release
```

Publish release assets named for `scripts/ensure-daemon.mjs`, for example:

- `crabtalk-daemon-x86_64-linux.tar.gz`
- `crabtalk-daemon-aarch64-linux.tar.gz`
- `crabtalk-daemon-x86_64-macos.tar.gz`
- `crabtalk-daemon-aarch64-macos.tar.gz`
- `crabtalk-daemon-x86_64-windows.zip`

Then verify a clean install can download and start the daemon through:

```bash
node scripts/start.mjs
```
