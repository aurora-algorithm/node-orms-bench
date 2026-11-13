// TypeORM with decorator entities and the repository API.
import "reflect-metadata";
import {
  Column,
  CreateDateColumn,
  DataSource,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from "typeorm";
import type { Feed, NewUser, Queries } from "./types.js";
import { DATABASE_URL, POOL_SIZE } from "./types.js";

@Entity("users")
class UserEntity {
  @PrimaryGeneratedColumn("identity", {
    generatedIdentity: "BY DEFAULT",
  })
  id: number;
  @Column()
  name: string;
  @Column()
  email: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
  @OneToMany(
    () => PostEntity,
    (post) => post.user,
    { cascade: true },
  )
  posts: PostEntity[];
}

@Entity("posts")
class PostEntity {
  @PrimaryGeneratedColumn("identity", {
    generatedIdentity: "BY DEFAULT",
  })
  id: number;
  @Column({ name: "user_id" })
  userId: number;
  @Column()
  title: string;
  @Column()
  body: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
  @ManyToOne(
    () => UserEntity,
    (user) => user.posts,
  )
  @JoinColumn({ name: "user_id" })
  user: UserEntity;
  @OneToMany(
    () => CommentEntity,
    (comment) => comment.post,
  )
  comments: CommentEntity[];
}

@Entity("comments")
class CommentEntity {
  @PrimaryGeneratedColumn("identity", {
    generatedIdentity: "BY DEFAULT",
  })
  id: number;
  @Column({ name: "post_id" })
  postId: number;
  @Column()
  author: string;
  @Column()
  body: string;
  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt: Date;
  @ManyToOne(
    () => PostEntity,
    (post) => post.comments,
  )
  @JoinColumn({ name: "post_id" })
  post: PostEntity;
}

const source = new DataSource({
  type: "postgres",
  url: DATABASE_URL,
  entities: [UserEntity, PostEntity, CommentEntity],
  extra: { max: POOL_SIZE },
});
const users = source.getRepository(UserEntity);
const posts = source.getRepository(PostEntity);
const comments = source.getRepository(CommentEntity);

const userCols = { id: true, name: true, email: true, createdAt: true };
const postCols = { id: true, title: true, body: true, createdAt: true };
const commentCols = {
  id: true,
  author: true,
  body: true,
  createdAt: true,
};

async function getUser(id: number) {
  return (
    (await users.findOne({ select: userCols, where: { id } })) ??
    undefined
  );
}

async function listUsers(limit: number) {
  return users.find({
    select: userCols,
    order: { id: "ASC" },
    take: limit,
  });
}

async function getFeed(id: number): Promise<Feed | undefined> {
  const found = await users.findOne({
    where: { id },
    relations: { posts: { comments: true } },
    select: {
      ...userCols,
      posts: { ...postCols, comments: commentCols },
    },
    order: { posts: { id: "ASC", comments: { id: "ASC" } } },
  });
  return found ?? undefined;
}

async function getFeedLoop(id: number): Promise<Feed | undefined> {
  const found = await getUser(id);
  if (!found) {
    return undefined;
  }
  const list = await posts.find({
    select: postCols,
    where: { userId: id },
    order: { id: "ASC" },
  });
  for (const p of list) {
    p.comments = await comments.find({
      select: commentCols,
      where: { postId: p.id },
      order: { id: "ASC" },
    });
  }
  return { ...found, posts: list };
}

async function createUser(input: NewUser): Promise<Feed> {
  const saved = await source.transaction(async (manager) => {
    const created = manager.create(UserEntity, {
      name: input.name,
      email: input.email,
      posts: input.posts.map((p) => manager.create(PostEntity, p)),
    });
    return manager.save(created);
  });
  const { id, name, email, createdAt } = saved;
  return {
    id,
    name,
    email,
    createdAt,
    posts: saved.posts.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      createdAt: p.createdAt,
    })),
  };
}

export async function connect(): Promise<Queries> {
  await source.initialize();
  await Promise.all(
    Array.from({ length: POOL_SIZE }, () => source.query("SELECT 1")),
  );
  return { getUser, listUsers, getFeed, getFeedLoop, createUser };
}
