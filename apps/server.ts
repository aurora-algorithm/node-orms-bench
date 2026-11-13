// One Express app for every library: the routes and the JSON are the same, only the queries differ.
// Run: ORM=prisma node dist/apps/server.js
import express from "express";
import type { NewUser, Queries } from "./types.js";

const PORTS: Record<string, number> = {
  "node-pg": 8301,
  kysely: 8302,
  drizzle: 8303,
  prisma: 8304,
  typeorm: 8305,
  "prisma-join": 8314,
  "drizzle-prep": 8313,
};
const orm = process.env.ORM ?? "";
const port = PORTS[orm];
if (!port) {
  throw new Error(
    `ORM must be one of ${Object.keys(PORTS).join(", ")}`,
  );
}
const lib = await import(`./${orm.replace(/-(join|prep)$/, "")}.js`);
const db: Queries = await lib.connect();

const app = express();
app.use(express.json());
if (process.env.DEMO === "1") {
  (await import("./demo.js")).countRequests(app);
}

function idOf(raw: string): number | undefined {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

app.get("/users", async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 1000);
  res.json(await db.listUsers(limit));
});

app.get("/users/:id", async (req, res) => {
  const id = idOf(req.params.id);
  const user = id ? await db.getUser(id) : undefined;
  if (!user) {
    return res.status(404).json({ error: "not found" });
  }
  res.json(user);
});

app.get("/users/:id/feed", async (req, res) => {
  const id = idOf(req.params.id);
  const feed = id ? await db.getFeed(id) : undefined;
  if (!feed) {
    return res.status(404).json({ error: "not found" });
  }
  res.json(feed);
});

app.get("/users/:id/feed-loop", async (req, res) => {
  const id = idOf(req.params.id);
  const feed = id ? await db.getFeedLoop(id) : undefined;
  if (!feed) {
    return res.status(404).json({ error: "not found" });
  }
  res.json(feed);
});

app.post("/users", async (req, res) => {
  const body = req.body as Partial<NewUser>;
  const valid =
    typeof body.name === "string" &&
    typeof body.email === "string" &&
    Array.isArray(body.posts) &&
    body.posts.every(
      (p) =>
        typeof p?.title === "string" && typeof p?.body === "string",
    );
  if (!valid) {
    return res.status(400).json({ error: "invalid body" });
  }
  res.status(201).json(await db.createUser(body as NewUser));
});

app.listen(port, () => console.log(`${orm} listening on :${port}`));
