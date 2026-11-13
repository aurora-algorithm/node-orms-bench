// Prisma ORM 7: the TypeScript query compiler on node-postgres (@prisma/adapter-pg).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import type { Feed, NewUser, Queries, User } from "./types.js";
import { DATABASE_URL, POOL_SIZE } from "./types.js";

const adapter = new PrismaPg({
  connectionString: DATABASE_URL,
  max: POOL_SIZE,
});
const prisma = new PrismaClient({ adapter });

// ORM=prisma-join loads relations with one JOIN query instead of one query per level.
const strategy = process.env.ORM === "prisma-join" ? "join" : "query";

const user = { id: true, name: true, email: true, createdAt: true };
const post = { id: true, title: true, body: true, createdAt: true };
const comment = { id: true, author: true, body: true, createdAt: true };

async function getUser(id: number): Promise<User | undefined> {
  const found = await prisma.user.findUnique({
    select: user,
    where: { id },
  });
  return found ?? undefined;
}

async function listUsers(limit: number): Promise<User[]> {
  return prisma.user.findMany({
    select: user,
    orderBy: { id: "asc" },
    take: limit,
  });
}

async function getFeed(id: number): Promise<Feed | undefined> {
  const found = await prisma.user.findUnique({
    relationLoadStrategy: strategy,
    where: { id },
    select: {
      ...user,
      posts: {
        orderBy: { id: "asc" },
        select: {
          ...post,
          comments: { orderBy: { id: "asc" }, select: comment },
        },
      },
    },
  });
  return found ?? undefined;
}

async function getFeedLoop(id: number): Promise<Feed | undefined> {
  const found = await getUser(id);
  if (!found) {
    return undefined;
  }
  const posts = await prisma.post.findMany({
    select: post,
    where: { userId: id },
    orderBy: { id: "asc" },
  });
  const withComments = [];
  for (const p of posts) {
    const comments = await prisma.comment.findMany({
      select: comment,
      where: { postId: p.id },
      orderBy: { id: "asc" },
    });
    withComments.push({ ...p, comments });
  }
  return { ...found, posts: withComments };
}

// A nested write: Prisma runs it in a transaction.
async function createUser(input: NewUser): Promise<Feed> {
  return prisma.user.create({
    relationLoadStrategy: strategy,
    data: {
      name: input.name,
      email: input.email,
      posts: { create: input.posts },
    },
    select: {
      ...user,
      posts: { orderBy: { id: "asc" }, select: post },
    },
  });
}

export async function connect(): Promise<Queries> {
  await Promise.all(
    Array.from({ length: POOL_SIZE }, () => prisma.$queryRaw`SELECT 1`),
  );
  return { getUser, listUsers, getFeed, getFeedLoop, createUser };
}
