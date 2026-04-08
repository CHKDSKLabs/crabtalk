import { Hono } from "hono";
import { cors } from "hono/cors";
import { type Env, createAuth } from "./auth.js";
import { rendezvousApp } from "./rendezvous.js";

const app = new Hono<{ Bindings: Env }>();

// CORS must be evaluated per-request because TRUSTED_ORIGINS lives in env bindings,
// not process.env, so we can't reference it at module load time.
app.use("*", async (c, next) => {
  const trusted = (c.env.TRUSTED_ORIGINS || "").split(",").filter(Boolean);
  return cors({ origin: trusted, credentials: true })(c, next);
});

app.on(["POST", "GET"], "/api/auth/**", (c) => {
  return createAuth(c.env).handler(c.req.raw);
});

app.get("/", (c) => {return c.redirect("https://crabtalk.dev", 302)});

app.get("/health", (c) => c.json({ status: "alive", service: "crabtalk-signal" }));

app.route("/", rendezvousApp);

app.get("/setup", async (c) => {
  const session = await createAuth(c.env)
    .api.getSession({ headers: c.req.raw.headers })
    .catch(() => null);

  if (!session?.user?.id) {
    return c.redirect("/api/auth/sign-in?callbackURL=/setup", 302);
  }

  const token = session.session.token;

  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CrabTalk Setup</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 24px; color: #1a1a1a; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    p { color: #555; margin-bottom: 24px; }
    .token-box { background: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 8px; padding: 16px; font-family: monospace; font-size: 0.875rem; word-break: break-all; margin-bottom: 16px; }
    button { background: #18181b; color: #fff; border: none; border-radius: 6px; padding: 10px 20px; font-size: 0.875rem; cursor: pointer; }
    button:hover { background: #3f3f46; }
    .copied { background: #16a34a !important; }
  </style>
</head>
<body>
  <h1>CrabTalk Setup Token</h1>
  <p>Copy this token and paste it into the setup prompt in your terminal.</p>
  <div class="token-box" id="token">${token}</div>
  <button onclick="const btn=this; navigator.clipboard.writeText(document.getElementById('token').textContent).then(()=>{btn.textContent='Copied!';btn.classList.add('copied');setTimeout(()=>{btn.textContent='Copy Token';btn.classList.remove('copied')},2000)})">Copy Token</button>
</body>
</html>`);
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
