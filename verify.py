"""Every app answers every route the same way: same users, posts and comments, same order, same fields.
Timestamps are compared as instants (Postgres's JSON writes them with an offset, Date objects with a Z).
Run inside the rig after the build: python3 verify.py"""

import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from datetime import datetime

APPS = {"node-pg": 8301, "kysely": 8302, "drizzle": 8303, "prisma": 8304, "typeorm": 8305, "prisma-join": 8314, "drizzle-prep": 8313}
GETS = ["/users/42", "/users?limit=50", "/users?limit=1000", "/users/42/feed", "/users/42/feed-loop", "/users/77/feed",
        "/users/99999", "/users/99999/feed"]
NEW = {"name": "Ada", "email": "ada@example.com", "posts": [{"title": "First", "body": "Hello"},
                                                             {"title": "Second", "body": "Again"}]}


def normal(value):
    if isinstance(value, dict):
        return {k: normal(v) for k, v in value.items()}
    if isinstance(value, list):
        return [normal(v) for v in value]
    if isinstance(value, str) and len(value) >= 19 and value[4] == "-" and value[10] == "T":
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    return value


def fetch(port: int, path: str, body: dict | None = None) -> tuple[int, object]:
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", data=data,
                                 headers={"content-type": "application/json"} if body else {})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as err:
        return err.code, json.load(err)


def shape(value):
    """The created rows' ids and timestamps differ between apps; compare everything else."""
    if isinstance(value, dict):
        return {k: shape(v) for k, v in value.items() if k not in ("id", "createdAt")}
    if isinstance(value, list):
        return [shape(v) for v in value]
    return value


def main() -> None:
    answers: dict[str, dict] = {}
    for app, port in APPS.items():
        proc = subprocess.Popen(["node", "dist/apps/server.js"], env={**os.environ, "ORM": app},
                                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, start_new_session=True)
        try:
            for _ in range(150):
                try:
                    fetch(port, "/users/1")
                    break
                except OSError:
                    time.sleep(0.1)
            got = {path: fetch(port, path) for path in GETS}
            status, created = fetch(port, "/users", NEW)
            got["POST /users"] = (status, shape(created))
            keys = sorted(created) if isinstance(created, dict) else []
            got["POST keys"] = (status, keys + sorted(created["posts"][0]) if keys else keys)
            answers[app] = {k: (s, normal(v)) for k, (s, v) in got.items()}
        finally:
            os.killpg(proc.pid, signal.SIGTERM)
            proc.wait(timeout=10)
    subprocess.run(["psql", "-q", "-d", "bench", "-c", "DELETE FROM posts WHERE id > 100000",
                    "-c", "DELETE FROM users WHERE id > 10000"], check=True)
    reference = answers["node-pg"]
    bad = 0
    for app, got in answers.items():
        for key, value in got.items():
            if value != reference[key]:
                bad += 1
                print(f"MISMATCH {app} {key}:\n  got  {json.dumps(value)[:300]}\n  want {json.dumps(reference[key])[:300]}")
    feed = reference["/users/42/feed"][1]
    print(f"verify: {len(APPS)} apps x {len(reference)} answers; user 42 has {len(feed['posts'])} posts, "
          f"{sum(len(p['comments']) for p in feed['posts'])} comments; {bad} mismatches")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
