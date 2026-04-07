import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { auth } from "./auth.js";
import { setupWebSocket } from "./signaling.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (process.env.TRUSTED_ORIGINS || "").split(",").filter(Boolean),
    credentials: true,
  })
);

app.on(["POST", "GET"], "/api/auth/**", (c) => {
  return auth.handler(c.req.raw);
});

app.get("/health", (c) => c.json({ status: "alive", service: "crabtalk-signal" }));

const port = parseInt(process.env.PORT || "3000", 10);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[CrabTalk Signal] Listening on port ${info.port}`);
});

setupWebSocket(server);
