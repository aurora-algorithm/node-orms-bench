// What every app answers, whichever library builds it.
export interface User {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
}
export interface Comment {
  id: number;
  author: string;
  body: string;
  createdAt: Date;
}
export interface Post {
  id: number;
  title: string;
  body: string;
  createdAt: Date;
  comments?: Comment[];
}
export interface Feed extends User {
  posts: Post[];
}
export interface NewUser {
  name: string;
  email: string;
  posts: { title: string; body: string }[];
}
export interface Queries {
  getUser(id: number): Promise<User | undefined>;
  listUsers(limit: number): Promise<User[]>;
  getFeed(id: number): Promise<Feed | undefined>;
  getFeedLoop(id: number): Promise<Feed | undefined>;
  createUser(input: NewUser): Promise<Feed>;
}

// The same pool size everywhere; every connection is opened before the load starts.
export const POOL_SIZE = 10;
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://dev:dev@127.0.0.1/bench";
