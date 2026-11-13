// Kysely: a typed query builder on node-postgres, no models.
import { type Generated, Kysely, PostgresDialect, sql } from "kysely";
import { jsonArrayFrom } from "kysely/helpers/postgres";
import pg from "pg";
import type { Feed, NewUser, Queries, User } from "./types.js";
import { DATABASE_URL, POOL_SIZE } from "./types.js";

interface Database {
  users: {
    id: Generated<number>;
    name: string;
    email: string;
    created_at: Generated<Date>;
  };
  posts: {
    id: Generated<number>;
    user_id: number;
    title: string;
    body: string;
    created_at: Generated<Date>;
  };
  comments: {
    id: Generated<number>;
    post_id: number;
    author: string;
    body: string;
    created_at: Generated<Date>;
  };
}

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: POOL_SIZE,
});
const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

const user = [
  "id",
  "name",
  "email",
  "created_at as createdAt",
] as const;
const post = [
  "id",
  "title",
  "body",
  "created_at as createdAt",
] as const;

async function getUser(id: number): Promise<User | undefined> {
  return db
    .selectFrom("users")
    .select(user)
    .where("id", "=", id)
    .executeTakeFirst();
}

async function listUsers(limit: number): Promise<User[]> {
  return db
    .selectFrom("users")
    .select(user)
    .orderBy("id")
    .limit(limit)
    .execute();
}

// jsonArrayFrom nests the rows as JSON inside one query (Kysely's docs on relations).
async function getFeed(id: number): Promise<Feed | undefined> {
  const row = await db
    .selectFrom("users")
    .select(user)
    .select((eb) => [
      jsonArrayFrom(
        eb
          .selectFrom("posts as p")
          .select([
            "p.id",
            "p.title",
            "p.body",
            "p.created_at as createdAt",
          ])
          .select((eb) => [
            jsonArrayFrom(
              eb
                .selectFrom("comments as c")
                .select([
                  "c.id",
                  "c.author",
                  "c.body",
                  "c.created_at as createdAt",
                ])
                .whereRef("c.post_id", "=", "p.id")
                .orderBy("c.id"),
            ).as("comments"),
          ])
          .whereRef("p.user_id", "=", "users.id")
          .orderBy("p.id"),
      ).as("posts"),
    ])
    .where("users.id", "=", id)
    .executeTakeFirst();
  return row as Feed | undefined;
}

async function getFeedLoop(id: number): Promise<Feed | undefined> {
  const found = await getUser(id);
  if (!found) {
    return undefined;
  }
  const posts = await db
    .selectFrom("posts")
    .select(post)
    .where("user_id", "=", id)
    .orderBy("id")
    .execute();
  const withComments = [];
  for (const p of posts) {
    const comments = await db
      .selectFrom("comments")
      .select(["id", "author", "body", "created_at as createdAt"])
      .where("post_id", "=", p.id)
      .orderBy("id")
      .execute();
    withComments.push({ ...p, comments });
  }
  return { ...found, posts: withComments };
}

async function createUser(input: NewUser): Promise<Feed> {
  return db.transaction().execute(async (trx) => {
    const created = await trx
      .insertInto("users")
      .values({ name: input.name, email: input.email })
      .returning(user)
      .executeTakeFirstOrThrow();
    const posts = await trx
      .insertInto("posts")
      .values(input.posts.map((p) => ({ ...p, user_id: created.id })))
      .returning(post)
      .execute();
    return { ...created, posts };
  });
}

export async function connect(): Promise<Queries> {
  await Promise.all(
    Array.from({ length: POOL_SIZE }, () => sql`SELECT 1`.execute(db)),
  );
  return { getUser, listUsers, getFeed, getFeedLoop, createUser };
}
