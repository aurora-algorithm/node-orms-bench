# node-orms-bench

How much do Prisma, Drizzle, Kysely and TypeORM cost on top of plain `pg`? Each library serves the same Express 5 API
over the same PostgreSQL database, written the way its own docs show. Two tuned variants sit beside them:
`drizzle-prep` (Drizzle's `.prepare()`) and `prisma-join` (Prisma's `relationLoadStrategy: "join"`).

## Results

Requests per second, the median of five runs (higher is better). Node runs on one CPU core, the pool has 10
connections, and every run gets a 10 s warm-up and 20 s of measurement, with the configurations in a new random order
each round.

| Test | node-pg | kysely | drizzle | drizzle-prep | prisma | prisma-join | typeorm |
|---|---:|---:|---:|---:|---:|---:|---:|
| One user by id | 16,056 | 13,300 | 9,463 | 15,076 | 7,281 |  | 10,706 |
| List of 50 users | 6,009 | 5,114 | 4,753 |  | 3,550 |  | 4,019 |
| List of 1,000 users | 472 | 408 | 466 |  | 297 |  | 303 |
| A user with posts and comments | 7,709 | 5,277 | 2,021 | 4,490 | 1,790 | 3,111 | 1,588 |
| Same, one query per post (N+1) | 2,051 | 1,527 | 928 |  | 914 |  | 1,011 |
| A user and three posts in one transaction | 5,655 | 5,714 | 3,454 |  | 2,335 |  | 4,219 |

Latency (p50, p99), Node and Postgres CPU, memory and SQL statements per request for every cell are in
`summary.json`; the raw runs are in `results/`. The `.cpuprofile` files in `profiles/` open in
[speedscope](https://www.speedscope.app).

It ran in Docker on an M1 Pro Mac, so compare the gaps between libraries, not the absolute numbers.

## Versions

- node v24.22.0
- express 5.3.0
- pg 8.23.1
- kysely 0.29.7
- drizzle-orm 0.45.4
- @prisma/client 7.10.1
- @prisma/adapter-pg 7.10.1
- typeorm 1.1.2
- oha 1.16.0
- postgres 17.11 (Ubuntu 17.11-1.pgdg24.04+2)
- cores: node 2, oha 6-8, postgres 3-5, monitoring 0-1

## Run it

The scripts expect an Ubuntu container named `longs-rig` with Node 24, PostgreSQL 17 and oha; the bench is copied into
it as `~/ormbench`. Any Linux machine works if you run the inner commands yourself.

1. `./sync_in.sh` copies the code into the container.
2. Inside it, `./prepare.sh` installs packages, builds, creates the `bench` database and checks that every app returns
   the same JSON (`verify.py`).
3. From the host, `./run_all.sh` runs every configuration five times and `python3 summarize_session.py results/session`
   writes the summary. `CHECK="drizzle feed,prisma feed" ./run_all.sh` reruns only the ones you name.

The servers are in `apps/`: `server.ts` holds the shared routes and each library has its own file. Want to try another
setting or another library? Add it to `servers.sh`, give it a port and run it next to the others.

## License

MIT
