# CrabTalk Marketing Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `marketing/index.html` — a lean, self-contained explainer page for CrabTalk targeting Claude Code power users, deployed to `crabtalk.dev`.

**Architecture:** Single static HTML file with all CSS and JS inline. No build step, no framework. Five visual sections: hero, what syncs, how it works, install CTA, footer. Matches existing brand tokens from `static/index.html`.

**Tech Stack:** HTML5, CSS (inline `<style>`), vanilla JS (inline `<script>`), Google Fonts (Inter)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `marketing/index.html` | Entire marketing site |
| Create | `marketing/assets/CRABTALK.svg` | Logo (copy from `static/assets/`) |

---

### Task 1: Scaffold `marketing/` directory and copy the SVG asset

**Files:**
- Create: `marketing/` directory
- Create: `marketing/assets/CRABTALK.svg` (copy of `static/assets/CRABTALK.svg`)

- [ ] **Step 1: Create the directory and copy the asset**

```bash
mkdir -p marketing/assets
cp static/assets/CRABTALK.svg marketing/assets/CRABTALK.svg
```

- [ ] **Step 2: Verify the copy exists**

```bash
ls marketing/assets/
```

Expected output: `CRABTALK.svg`

- [ ] **Step 3: Commit**

```bash
git add marketing/assets/CRABTALK.svg
git commit -m "feat: scaffold marketing/ with CRABTALK.svg asset"
```

---

### Task 2: Create `marketing/index.html` with head and all CSS

**Files:**
- Create: `marketing/index.html`

- [ ] **Step 1: Create the file**

Create `marketing/index.html` with the following complete content (body is empty for now — sections will be added in subsequent tasks):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CrabTalk — P2P sync for your Claude Code config</title>
  <meta name="description" content="CrabTalk syncs your Claude Code plugins, agents, settings, and instructions across machines — directly, peer-to-peer, no cloud in the middle.">
  <link rel="icon" type="image/svg+xml" href="assets/CRABTALK.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --accent: #e8851a;
      --accent-dark: #d4760f;
      --text: #e6edf3;
      --muted: #8b949e;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      line-height: 1.6;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 0 1.5rem;
    }

    /* ── nav ───────────────────────────────────────── */
    nav {
      padding: 1.25rem 1.5rem;
      display: flex;
      align-items: center;
      gap: 0.625rem;
      border-bottom: 1px solid var(--border);
    }

    nav img { width: 28px; height: 28px; }

    nav span {
      font-weight: 600;
      font-size: 1rem;
      color: var(--accent);
    }

    /* ── hero ──────────────────────────────────────── */
    .hero {
      text-align: center;
      padding: 5rem 1.5rem 4rem;
    }

    .hero img {
      width: 80px;
      height: 80px;
      margin-bottom: 1.5rem;
    }

    .hero h1 {
      font-size: clamp(1.75rem, 5vw, 2.75rem);
      font-weight: 600;
      line-height: 1.2;
      margin-bottom: 1rem;
    }

    .hero p {
      font-size: 1.125rem;
      color: var(--muted);
      max-width: 520px;
      margin: 0 auto 2rem;
    }

    .btn {
      display: inline-block;
      background: var(--accent);
      color: var(--bg);
      font-family: 'Inter', sans-serif;
      font-size: 0.9375rem;
      font-weight: 600;
      padding: 0.75rem 1.75rem;
      border-radius: 6px;
      text-decoration: none;
      transition: background 0.15s;
    }

    .btn:hover { background: var(--accent-dark); }

    /* ── sections ──────────────────────────────────── */
    section { padding: 4rem 1.5rem; }

    section.alt {
      background: var(--surface);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
    }

    .section-label {
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 0.75rem;
    }

    .section-title {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
    }

    .section-sub {
      color: var(--muted);
      margin-bottom: 2rem;
      max-width: 540px;
    }

    /* ── what syncs chips ──────────────────────────── */
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.625rem;
    }

    .chip {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 0.5rem 0.875rem;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .chip code {
      font-family: 'Courier New', monospace;
      color: var(--muted);
      font-size: 0.8125rem;
      display: block;
      margin-top: 0.125rem;
      font-weight: 400;
    }

    /* ── how it works steps ────────────────────────── */
    .steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1.5rem;
    }

    .step {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1.25rem;
    }

    .step-num {
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 0.5rem;
    }

    .step h3 {
      font-size: 0.9375rem;
      font-weight: 600;
      margin-bottom: 0.375rem;
    }

    .step p {
      font-size: 0.875rem;
      color: var(--muted);
      line-height: 1.5;
    }

    .step code {
      font-family: 'Courier New', monospace;
      color: var(--accent);
      font-size: 0.875rem;
    }

    /* ── install CTA ───────────────────────────────── */
    .install-block {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 1rem 1rem 1rem 1.25rem;
      margin-bottom: 1rem;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .install-block code {
      font-family: 'Courier New', monospace;
      font-size: 0.9375rem;
      word-break: break-all;
    }

    .copy-btn {
      flex-shrink: 0;
      background: var(--border);
      border: 1px solid #444c56;
      border-radius: 4px;
      color: var(--text);
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      font-size: 0.75rem;
      padding: 0.3125rem 0.75rem;
      transition: background 0.15s;
    }

    .copy-btn:hover { background: #444c56; }
    .copy-btn.copied { color: #3fb950; }

    .install-note {
      font-size: 0.875rem;
      color: var(--muted);
      line-height: 1.5;
      margin-bottom: 1.5rem;
    }

    .install-note code {
      font-family: 'Courier New', monospace;
      color: var(--accent);
    }

    /* ── footer ────────────────────────────────────── */
    footer {
      padding: 2rem 1.5rem;
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: center;
      gap: 1.5rem;
      font-size: 0.8125rem;
    }

    footer a {
      color: var(--muted);
      text-decoration: none;
      transition: color 0.15s;
    }

    footer a:hover { color: var(--text); }
  </style>
</head>
<body>
</body>
</html>
```

- [ ] **Step 2: Open in a browser and verify the page loads without errors**

Open `marketing/index.html` in a browser. Expected: blank dark page (`#0d1117` background), no console errors, Inter font loaded.

- [ ] **Step 3: Commit**

```bash
git add marketing/index.html
git commit -m "feat: add marketing/index.html with full CSS"
```

---

### Task 3: Add nav and hero section

**Files:**
- Modify: `marketing/index.html` — replace `<body>` with nav + hero HTML

- [ ] **Step 1: Replace the empty `<body>` tag with nav + hero**

Replace:
```html
<body>
</body>
```

With:
```html
<body>

  <nav>
    <img src="assets/CRABTALK.svg" alt="CrabTalk">
    <span>CrabTalk</span>
  </nav>

  <div class="hero">
    <img src="assets/CRABTALK.svg" alt="CrabTalk">
    <h1>Your Claude Code config,<br>everywhere you work.</h1>
    <p>CrabTalk syncs plugins, agents, settings, and instructions across your machines — directly, peer-to-peer, no cloud in the middle.</p>
    <a class="btn" href="#install">Get Started</a>
  </div>

</body>
```

- [ ] **Step 2: Open in browser and verify**

Expected: dark page with logo in nav bar, large centered headline, muted subhead, orange "Get Started" button. Clicking the button should scroll to nothing yet (that's fine).

- [ ] **Step 3: Commit**

```bash
git add marketing/index.html
git commit -m "feat: add nav and hero section"
```

---

### Task 4: Add "What Syncs" section

**Files:**
- Modify: `marketing/index.html` — add section after the hero `<div>`

- [ ] **Step 1: Add the section after the closing `</div>` of `.hero`**

Insert after `</div>` (the hero div):

```html
  <section class="alt">
    <div class="container">
      <p class="section-label">What syncs</p>
      <h2 class="section-title">Everything that makes Claude Code yours.</h2>
      <p class="section-sub">CrabTalk watches these paths and pushes changes to connected peers the moment they land on disk.</p>
      <div class="chips">
        <div class="chip">Plugins<code>~/.claude/plugins/</code></div>
        <div class="chip">Agents<code>~/.claude/agents/</code></div>
        <div class="chip">Settings &amp; statusline<code>~/.claude/settings.json</code></div>
        <div class="chip">Global instructions<code>~/.claude/CLAUDE.md</code></div>
        <div class="chip">Keybindings<code>~/.claude/keybindings.json</code></div>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Open in browser and verify**

Expected: alternating `#161b22` background section with five chip badges, each showing a label and a muted monospace path below it.

- [ ] **Step 3: Commit**

```bash
git add marketing/index.html
git commit -m "feat: add what syncs section"
```

---

### Task 5: Add "How It Works" section

**Files:**
- Modify: `marketing/index.html` — add section after "what syncs"

- [ ] **Step 1: Add the section after the closing `</section>` of "what syncs"**

```html
  <section>
    <div class="container">
      <p class="section-label">How it works</p>
      <h2 class="section-title">Up and running in three steps.</h2>
      <p class="section-sub">No daemon to babysit, no config to sync manually.</p>
      <div class="steps">
        <div class="step">
          <div class="step-num">1</div>
          <h3>Install the plugin</h3>
          <p>Point Claude Code at the crabtalk directory using <code>--plugin-dir</code>.</p>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <h3>Authenticate</h3>
          <p>Run <code>/crabtalk:setup</code> in any Claude Code session and log in at <code>claw.crabtalk.dev</code> to get your token.</p>
        </div>
        <div class="step">
          <div class="step-num">3</div>
          <h3>Add more machines</h3>
          <p>Repeat on any other machine. Peers find each other automatically — sync starts immediately.</p>
        </div>
      </div>
    </div>
  </section>
```

- [ ] **Step 2: Open in browser and verify**

Expected: three numbered step cards in a responsive grid, orange step numbers, inline `<code>` elements styled in orange.

- [ ] **Step 3: Commit**

```bash
git add marketing/index.html
git commit -m "feat: add how it works section"
```

---

### Task 6: Add install CTA section with copy-to-clipboard

**Files:**
- Modify: `marketing/index.html` — add section + `<script>` tag

- [ ] **Step 1: Add the install section after the closing `</section>` of "how it works"**

```html
  <section class="alt" id="install">
    <div class="container">
      <p class="section-label">Install</p>
      <h2 class="section-title">Get the plugin.</h2>
      <div class="install-block">
        <code id="install-cmd">claude --plugin-dir /path/to/crabtalk</code>
        <button class="copy-btn" id="copy-btn" type="button">Copy</button>
      </div>
      <p class="install-note">
        Replace <code>/path/to/crabtalk</code> with the directory where you cloned this repo.<br>
        Then run <code>/crabtalk:setup</code> in any Claude Code session to link your account.
      </p>
      <a class="btn" href="https://claw.crabtalk.dev" target="_blank" rel="noopener">Create an Account</a>
    </div>
  </section>
```

- [ ] **Step 2: Add the script tag before `</body>`**

Add just before `</body>`:

```html
  <script>
    document.getElementById('copy-btn').addEventListener('click', () => {
      const text = document.getElementById('install-cmd').textContent;
      navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById('copy-btn');
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.classList.remove('copied');
        }, 1500);
      });
    });
  </script>
```

- [ ] **Step 3: Verify copy button works**

Open in browser. Click "Copy". Expected: button text changes to "Copied!" in green for 1.5s, then reverts. Paste into a text editor — should contain `claude --plugin-dir /path/to/crabtalk`.

- [ ] **Step 4: Verify "Get Started" button scrolls**

Click "Get Started" in the hero. Expected: page scrolls smoothly to the install section.

- [ ] **Step 5: Commit**

```bash
git add marketing/index.html
git commit -m "feat: add install CTA section with copy-to-clipboard"
```

---

### Task 7: Add footer and final verification

**Files:**
- Modify: `marketing/index.html` — add `<footer>` before `</body>`

- [ ] **Step 1: Add footer before the `<script>` tag**

Insert before the `<script>` tag:

```html
  <footer>
    <a href="https://chkdsklabs.io" target="_blank" rel="noopener">Made by CHKDSK Labs</a>
    <a href="https://buymeacoffee.com/jayub" target="_blank" rel="noopener">☕ Buy me a coffee</a>
  </footer>
```

- [ ] **Step 2: Full visual walkthrough in browser**

Open `marketing/index.html`. Verify in order:
1. Nav bar: logo + "CrabTalk" in orange
2. Hero: large headline, muted subhead, orange "Get Started" button
3. "What syncs" section: 5 chips with paths
4. "How it works" section: 3 step cards
5. Install section: copyable command, note text, orange "Create an Account" button
6. Footer: two muted links

- [ ] **Step 3: Check responsive layout**

Resize the browser window to ~375px width. Expected: chips wrap, steps stack vertically, install block stacks (text above button), no horizontal scroll.

- [ ] **Step 4: Final commit**

```bash
git add marketing/index.html
git commit -m "feat: add footer — marketing site complete"
```
