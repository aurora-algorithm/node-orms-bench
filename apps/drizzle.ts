// Drizzle ORM on node-postgres, with its relational queries.
import { asc, eq, type Placeholder, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./drizzle-schema.js";
import { comments, posts, users } from "./drizzle-schema.js";
import type { Feed, NewUser, Queries, User } from "./types.js";
import { DATABASE_URL, POOL_SIZE } from "./types.js";

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: POOL_SIZE,
});
const db = drizzle({ client: pool, schema });

const user = {
  id: users.id,
  name: users.name,
  email: users.email,
  createdAt: users.createdAt,
};
const post = {
  id: posts.id,
  title: posts.title,
  body: posts.body,
  createdAt: posts.createdAt,
};
const comment = {
  id: comments.id,
  author: comments.author,
  body: comments.body,
  createdAt: comments.createdAt,
};

async function getUser(id: number): Promise<User | undefined> {
  const rows = await db
    .select(user)
    .from(users)
    .where(eq(users.id, id));
  return rows[0];
}

async function listUsers(limit: number): Promise<User[]> {
  return db
    .select(user)
    .from(users)
    .orderBy(asc(users.id))
    .limit(limit);
}

const feedQuery = (id: number | Placeholder) =>
  db.query.users.findFirst({
    columns: { id: true, name: true, email: true, createdAt: true },
    where: eq(users.id, id),
    with: {
      posts: {
        columns: { id: true, title: true, body: true, createdAt: true },
        orderBy: asc(posts.id),
        with: {
          comments: {
            columns: {
              id: true,
              author: true,
              body: true,
              createdAt: true,
            },
            orderBy: asc(comments.id),
          },
        },
      },
    },
  });

async function getFeed(id: number): Promise<Feed | undefined> {
  return feedQuery(id);
}

async function getFeedLoop(id: number): Promise<Feed | undefined> {
  const found = await getUser(id);
  if (!found) {
    return undefined;
  }
  const rows = await db
    .select(post)
    .from(posts)
    .where(eq(posts.userId, id))
    .orderBy(asc(posts.id));
  const withComments = [];
  for (const p of rows) {
    const list = await db
      .select(comment)
      .from(comments)
      .where(eq(comments.postId, p.id))
      .orderBy(asc(comments.id));
    withComments.push({ ...p, comments: list });
  }
  return { ...found, posts: withComments };
}

async function createUser(input: NewUser): Promise<Feed> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({ name: input.name, email: input.email })
      .returning(user);
    const list = await tx
      .insert(posts)
      .values(input.posts.map((p) => ({ ...p, userId: created.id })))
      .returning(post);
    return { ...created, posts: list };
  });
}

// ORM=drizzle-prep: the same queries built once with .prepare(), then run with a new id each time.
const userById = db
  .select(user)
  .from(users)
  .where(eq(users.id, sql.placeholder("id")))
  .prepare("user_by_id");
const feedById = feedQuery(sql.placeholder("id")).prepare("feed_by_id");

const prepared = {
  getUser: async (id: number) => (await userById.execute({ id }))[0],
  getFeed: (id: number) => feedById.execute({ id }),
};

export async function connect(): Promise<Queries> {
  await Promise.all(
    Array.from({ length: POOL_SIZE }, () => db.execute(sql`SELECT 1`)),
  );
  const queries = {
    getUser,
    listUsers,
    getFeed,
    getFeedLoop,
    createUser,
  };
  return process.env.ORM === "drizzle-prep"
    ? { ...queries, ...prepared }
    : queries;
}
