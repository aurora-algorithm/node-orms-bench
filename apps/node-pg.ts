// node-postgres with hand-written SQL: the driver the other libraries run on.
import pg from "pg";
import type { Feed, NewUser, Post, Queries, User } from "./types.js";
import { DATABASE_URL, POOL_SIZE } from "./types.js";

const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: POOL_SIZE,
});

const USER = `id, name, email, created_at AS "createdAt"`;
const POST = `id, title, body, created_at AS "createdAt"`;

async function getUser(id: number): Promise<User | undefined> {
  const { rows } = await pool.query(
    `SELECT ${USER} FROM users WHERE id = $1`,
    [id],
  );
  return rows[0];
}

async function listUsers(limit: number): Promise<User[]> {
  const { rows } = await pool.query(
    `SELECT ${USER} FROM users ORDER BY id LIMIT $1`,
    [limit],
  );
  return rows;
}

// One query: Postgres builds the nested JSON itself.
async function getFeed(id: number): Promise<Feed | undefined> {
  const { rows } = await pool.query(
    `SELECT u.id, u.name, u.email, u.created_at AS "createdAt",
       coalesce((
         SELECT json_agg(json_build_object(
           'id', p.id, 'title', p.title, 'body', p.body,
           'createdAt', p.created_at,
           'comments', coalesce((
             SELECT json_agg(json_build_object(
               'id', c.id, 'author', c.author, 'body', c.body,
               'createdAt', c.created_at) ORDER BY c.id)
             FROM comments c WHERE c.post_id = p.id), '[]')
         ) ORDER BY p.id)
         FROM posts p WHERE p.user_id = u.id), '[]') AS posts
     FROM users u WHERE u.id = $1`,
    [id],
  );
  return rows[0];
}

// The N+1 way: the user, their posts, then one query per post.
async function getFeedLoop(id: number): Promise<Feed | undefined> {
  const user = await getUser(id);
  if (!user) {
    return undefined;
  }
  const { rows: posts } = await pool.query<Post>(
    `SELECT ${POST} FROM posts WHERE user_id = $1 ORDER BY id`,
    [id],
  );
  for (const post of posts) {
    const { rows } = await pool.query(
      `SELECT id, author, body, created_at AS "createdAt"
       FROM comments WHERE post_id = $1 ORDER BY id`,
      [post.id],
    );
    post.comments = rows;
  }
  return { ...user, posts };
}

async function createUser(input: NewUser): Promise<Feed> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO users (name, email) VALUES ($1, $2) RETURNING ${USER}`,
      [input.name, input.email],
    );
    const user = rows[0];
    const posts: Post[] = [];
    for (const p of input.posts) {
      const res = await client.query(
        `INSERT INTO posts (user_id, title, body)
         VALUES ($1, $2, $3) RETURNING ${POST}`,
        [user.id, p.title, p.body],
      );
      posts.push(res.rows[0]);
    }
    await client.query("COMMIT");
    return { ...user, posts };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function connect(): Promise<Queries> {
  await Promise.all(
    Array.from({ length: POOL_SIZE }, () => pool.query("SELECT 1")),
  );
  return { getUser, listUsers, getFeed, getFeedLoop, createUser };
}
