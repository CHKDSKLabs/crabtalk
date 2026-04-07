# Auth Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the bare unstyled `static/index.html` with a polished, on-brand auth page and add a Cloudflare Pages `_headers` security file.

**Architecture:** Single self-contained `index.html` (inline CSS + inline JS, one Google Fonts CDN import). A companion `_headers` file handles Cloudflare Pages security headers. No build step, no dependencies, no framework.

**Tech Stack:** Vanilla HTML/CSS/JS, Inter (Google Fonts CDN), Cloudflare Pages static hosting.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `static/index.html` | Complete page — structure, styles, login form, success state, JS |
| Create | `static/_headers` | Cloudflare Pages HTTP security headers |

---

### Task 1: Create `static/_headers`

**Files:**
- Create: `static/_headers`

- [ ] **Step 1: Create the file**

```
/*
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Content-Security-Policy: default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src https://your-signal-server.com
```

> **Note:** The `connect-src` value must be updated to match your signal server URL at deploy time — same as the `API` constant in `index.html`. `unsafe-inline` is required because the page uses inline `<style>` and `<script>` with no build step to produce hashes.

- [ ] **Step 2: Verify the file**

Open `static/_headers` and confirm it contains exactly 5 lines (one blank header rule line + 4 directives). No trailing whitespace issues.

- [ ] **Step 3: Commit**

```bash
git add static/_headers
git commit -m "feat: add Cloudflare Pages security headers"
```

---

### Task 2: Rewrite `static/index.html`

**Files:**
- Modify: `static/index.html`

This is a full replacement of the existing file. The current file is a bare stub (~35 lines, no CSS, missing the `#google` element its own JS references). Replace it entirely with the following.

- [ ] **Step 1: Replace `static/index.html` with the full implementation**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CrabTalk</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #0d1117;
      color: #e6edf3;
      font-family: 'Inter', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }

    .card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      padding: 2.5rem;
      width: 100%;
      max-width: 400px;
    }

    .hero {
      font-size: 4rem;
      text-align: center;
      margin-bottom: 0.5rem;
      line-height: 1;
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 600;
      color: #e8851a;
      text-align: center;
      margin-bottom: 0.5rem;
    }

    .subtitle {
      font-size: 0.875rem;
      color: #8b949e;
      text-align: center;
      margin-bottom: 2rem;
      line-height: 1.5;
    }

    .field {
      margin-bottom: 1rem;
    }

    input {
      width: 100%;
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 6px;
      color: #e6edf3;
      font-family: 'Inter', sans-serif;
      font-size: 0.9375rem;
      padding: 0.625rem 0.875rem;
      outline: none;
      transition: border-color 0.15s;
    }

    input:focus {
      border-color: #e8851a;
      outline: 2px solid rgba(232, 133, 26, 0.3);
      outline-offset: 0;
    }

    input::placeholder {
      color: #8b949e;
    }

    button[type="submit"] {
      width: 100%;
      background: #e8851a;
      border: none;
      border-radius: 6px;
      color: #0d1117;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      font-size: 0.9375rem;
      font-weight: 600;
      margin-top: 0.5rem;
      padding: 0.625rem 0.875rem;
      transition: background 0.15s;
    }

    button[type="submit"]:hover {
      background: #d4760f;
    }

    .error {
      color: #f85149;
      font-size: 0.875rem;
      margin-top: 0.75rem;
      text-align: center;
      min-height: 1.25rem;
    }

    .success-heading {
      font-size: 1.25rem;
      font-weight: 600;
      text-align: center;
      margin-bottom: 1rem;
    }

    .token-block {
      background: #0d1117;
      border: 1px solid #e8851a;
      border-radius: 6px;
      padding: 0.875rem;
      margin-bottom: 1rem;
      position: relative;
    }

    .token-value {
      font-family: 'Courier New', monospace;
      font-size: 0.8125rem;
      color: #e6edf3;
      word-break: break-all;
      padding-right: 4rem;
    }

    .copy-btn {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      background: #30363d;
      border: 1px solid #444c56;
      border-radius: 4px;
      color: #e6edf3;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      padding: 0.25rem 0.625rem;
      transition: background 0.15s;
    }

    .copy-btn:hover {
      background: #444c56;
    }

    .copy-btn.copied {
      color: #3fb950;
    }

    .success-instruction {
      font-size: 0.875rem;
      color: #8b949e;
      text-align: center;
      line-height: 1.5;
    }

    .success-instruction code {
      font-family: 'Courier New', monospace;
      color: #e8851a;
    }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="hero">🦀</div>
    <h1>CrabTalk</h1>
    <p class="subtitle">Authenticate to get a session token for your Claude Code plugin.</p>
    <form id="login-form">
      <div class="field">
        <input type="email" name="email" placeholder="Email" required autocomplete="email">
      </div>
      <div class="field">
        <input type="password" name="password" placeholder="Password" required autocomplete="current-password">
      </div>
      <button type="submit">Log In</button>
    </form>
    <p class="error" id="error-msg"></p>
  </div>

  <script>
    // ─── CONFIGURE BEFORE DEPLOY ──────────────────────────────
    const API = 'https://your-signal-server.com';
    // ──────────────────────────────────────────────────────────

    const form = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-msg');
    const card = document.getElementById('card');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorMsg.textContent = '';

      const data = new FormData(e.target);
      let res, json;

      try {
        res = await fetch(`${API}/api/auth/sign-in/email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.get('email'), password: data.get('password') }),
          credentials: 'include',
        });
        json = await res.json();
      } catch {
        errorMsg.textContent = 'Could not reach the signal server. Check your connection.';
        return;
      }

      if (!res.ok || !json.token) {
        errorMsg.textContent = json.message || 'Login failed. Check your credentials.';
        return;
      }

      showSuccess(json.token);
    });

    function showSuccess(token) {
      card.innerHTML = `
        <div class="hero">🦀</div>
        <h1>CrabTalk</h1>
        <p class="success-heading">Authenticated.</p>
        <div class="token-block">
          <div class="token-value" id="token-value">${token}</div>
          <button class="copy-btn" id="copy-btn">Copy</button>
        </div>
        <p class="success-instruction">Copy this token into your <code>/crabtalk:setup</code> session.</p>
      `;

      document.getElementById('copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(token).then(() => {
          const btn = document.getElementById('copy-btn');
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
          }, 1500);
        });
      });
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Manually verify — login state**

Open `static/index.html` directly in a browser (no server needed for visual check).

Confirm:
- Dark background, centered card
- `🦀` emoji at ~4rem
- "CrabTalk" in amber
- Subtitle text visible in muted grey
- Email and password inputs styled (dark fill, grey border)
- "Log In" button full-width, amber
- No visible error message

- [ ] **Step 3: Manually verify — success state**

In the browser console, paste and run:

```js
showSuccess('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token');
```

Confirm:
- Form is replaced with the success view (no page reload)
- Token displayed in monospace block with amber border
- "Copy" button is present
- Clicking "Copy" changes button to "Copied!" in green, reverts after ~1.5s
- Instruction text shows `/crabtalk:setup` in amber monospace

- [ ] **Step 4: Manually verify — error state**

In the browser console, paste and run:

```js
document.getElementById('error-msg').textContent = 'Login failed. Check your credentials.';
```

Confirm: red error text appears below the button without layout shift.

- [ ] **Step 5: Commit**

```bash
git add static/index.html
git commit -m "feat: redesign auth page with Crab Shack aesthetic"
```

---

### Task 3: Update RUNBOOK to reference Cloudflare Pages

**Files:**
- Modify: `RUNBOOK.md` (section 4 — Auth Pages)

The runbook currently instructs deployers to use GitHub Pages. Update it to reference Cloudflare Pages and the new `_headers` file.

- [ ] **Step 1: Replace the Auth Pages section**

In `RUNBOOK.md`, find section `## 4. Auth Pages (GitHub Pages)` and replace the entire section with:

```markdown
## 4. Auth Pages (Cloudflare Pages)

BetterAuth handles the API routes (`/api/auth/*`) but you need a frontend page for browser-based login.

### Deploy to Cloudflare Pages

1. In `static/index.html`, update the `API` constant at the top of the `<script>` block to your signal server URL
2. In `static/_headers`, update the `connect-src` directive to match the same URL
3. In Cloudflare Pages: connect your repo, set build command to *(none)*, output directory to `static`
4. Add your Cloudflare Pages URL to `TRUSTED_ORIGINS` on the signal server

### Verify

Open your Cloudflare Pages URL in a browser. You should see the CrabTalk login card.
```

- [ ] **Step 2: Verify the section reads correctly**

Open `RUNBOOK.md` and confirm section 4 no longer references GitHub Pages and the two-step deploy instructions (edit `API` + edit `_headers`) are present.

- [ ] **Step 3: Commit**

```bash
git add RUNBOOK.md
git commit -m "docs: update runbook — GitHub Pages → Cloudflare Pages"
```
