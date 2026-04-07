import { Hono } from "hono";
import { cors } from "hono/cors";
import { type Env, createAuth } from "./auth.js";

export { SignalingRoom } from "./signaling.js";

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

app.get("/health", (c) => c.json({ status: "alive", service: "crabtalk-signal" }));

app.get("/ws", async (c) => {
  if (c.req.header("Upgrade") !== "websocket") {
    return c.text("Expected websocket", 426);
  }

  const authHeader = c.req.header("Authorization");
  const deviceName = c.req.header("X-Device-Name");

  if (!authHeader || !deviceName) {
    return c.text("Missing Authorization or X-Device-Name header", 400);
  }

  const session = await createAuth(c.env)
    .api.getSession({ headers: c.req.raw.headers })
    .catch(() => null);

  if (!session?.user?.id) {
    return c.text("Unauthorized", 401);
  }

  // Each user gets their own DO — all their devices share one instance so
  // broadcastPeerList() can reach every connected socket without cross-instance calls.
  const stub = c.env.SIGNALING.get(c.env.SIGNALING.idFromName(session.user.id));

  return stub.fetch(
    new Request(c.req.url, {
      headers: new Headers({
        Upgrade: "websocket",
        "X-User-Id": session.user.id,
        "X-Device-Name": deviceName,
      }),
    })
  );
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;
