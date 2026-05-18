import { Hono } from "hono";
import { and, eq, gt, ne } from "drizzle-orm";
import { type Env, createAuth } from "./auth.js";
import { createDb } from "./db/index.js";
import { peers } from "./db/schema.js";

const rendezvousApp = new Hono<{ Bindings: Env }>();

rendezvousApp.post("/api/rendezvous", async (c) => {
  const session = await createAuth(c.env)
    .api.getSession({ headers: c.req.raw.headers })
    .catch(() => null);

  if (!session?.user?.id) {
    return c.text("Unauthorized", 401);
  }

  const body = await c.req.json<{ deviceName: string; multiaddrs: string[] }>();

  if (!body.deviceName || !Array.isArray(body.multiaddrs)) {
    return c.text("Bad Request", 400);
  }

  const db = createDb(c.env.DATABASE_URL);

  await db
    .insert(peers)
    .values({
      id: `${session.user.id}:${body.deviceName}`,
      userId: session.user.id,
      deviceName: body.deviceName,
      multiaddrs: JSON.stringify(body.multiaddrs),
      lastSeen: new Date(),
    })
    .onConflictDoUpdate({
      target: peers.id,
      set: {
        multiaddrs: JSON.stringify(body.multiaddrs),
        lastSeen: new Date(),
      },
    });

  return c.json({ ok: true });
});

rendezvousApp.get("/api/rendezvous", async (c) => {
  const session = await createAuth(c.env)
    .api.getSession({ headers: c.req.raw.headers })
    .catch(() => null);

  if (!session?.user?.id) {
    return c.text("Unauthorized", 401);
  }

  const requestingDevice = c.req.header("X-Device-Name") ?? "";
  const db = createDb(c.env.DATABASE_URL);
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);

  const rows = await db
    .select()
    .from(peers)
    .where(
      and(
        eq(peers.userId, session.user.id),
        ne(peers.deviceName, requestingDevice),
        gt(peers.lastSeen, cutoff)
      )
    );

  const result = rows.map((row) => ({
    deviceName: row.deviceName,
    multiaddrs: row.multiaddrs ? (JSON.parse(row.multiaddrs) as string[]) : [],
  }));

  return c.json(result);
});

rendezvousApp.delete("/api/rendezvous/:deviceName", async (c) => {
  const session = await createAuth(c.env)
    .api.getSession({ headers: c.req.raw.headers })
    .catch(() => null);

  if (!session?.user?.id) {
    return c.text("Unauthorized", 401);
  }

  const deviceName = c.req.param("deviceName");
  const db = createDb(c.env.DATABASE_URL);

  await db
    .delete(peers)
    .where(eq(peers.id, `${session.user.id}:${deviceName}`));

  return c.json({ ok: true });
});

export { rendezvousApp };
