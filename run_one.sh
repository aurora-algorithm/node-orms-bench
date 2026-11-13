#!/bin/bash
# One measured run inside the rig: start the app on its core, warm up 10 s, load it 20 s with 64 connections, then
# store oha's summary and per-request log, what Prometheus recorded and what Postgres ran during those 20 s.
# usage: run_one.sh <app> <route: one|list50|list1000|feed|loop|write> <run>   (run "demo" turns on the request counter)
set -euo pipefail
cd "$(dirname "$0")"
source servers.sh
source cores.sh
name=$1; route=$2; run=$3
DURATION=${DURATION:-20}
WARMUP=${WARMUP:-10}
CONNECTIONS=${CONNECTIONS:-64}
export DATABASE_URL=${DATABASE_URL:-postgres://dev:dev@127.0.0.1/bench}
port=$(port_of "$name")
path=$(route_path "$route")
url="http://localhost:$port$path"
req=(--rand-regex-url)
check_url="http://127.0.0.1:$port/users/1"
if [ "$route" = write ]; then
  req=(-m POST -H "content-type: application/json" -d "$WRITE_BODY")
  url="http://127.0.0.1:$port$path"
elif [[ $path != *'['* ]]; then
  req=()
  url="http://127.0.0.1:$port$path"
fi
mkdir -p results
work=$(mktemp -d)
demo=
[ "$run" = demo ] && demo=DEMO=1
setsid taskset -c "$SERVER_CORES" bash -c "$demo $(server_cmd "$name")" > "$work/server.log" 2>&1 & pid=$!
stop() {
  kill -- -"$pid" 2>/dev/null || true
  for _ in $(seq 100); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  if kill -0 "$pid" 2>/dev/null; then
    echo "run_one: $name did not stop within 10 s, killing it" >&2
    kill -KILL -- -"$pid" 2>/dev/null || true
  fi
  wait "$pid" 2>/dev/null || true
  rm -rf "$work"
  # Writes grow the tables; put them back to the seeded size so the next run reads the same data.
  if [ "$route" = write ]; then
    psql -q "$DATABASE_URL" -c 'DELETE FROM posts WHERE id > 100000' -c 'DELETE FROM users WHERE id > 10000' \
      -c 'VACUUM ANALYZE users, posts' >/dev/null
  fi
}
trap stop EXIT
ready=0
for _ in $(seq 150); do curl -sf -o /dev/null "$check_url" && { ready=1; break; }; sleep 0.1; done
[ "$ready" = 1 ] || { echo "run_one: $name not ready on :$port after 15 s" >&2; tail -20 "$work/server.log" >&2; exit 1; }
taskset -c "$OHA_CORES" oha -z ${WARMUP}s -c $CONNECTIONS "${req[@]}" --no-tui --output-format quiet "$url" >/dev/null
psql -q "$DATABASE_URL" -tAc 'SELECT pg_stat_statements_reset()' >/dev/null
start=$(date +%s.%N)
grep '^cpu[0-9]' /proc/stat > "$work/stat-start"
(sleep $DURATION; grep '^cpu[0-9]' /proc/stat > "$work/stat-end") & sampler=$!
taskset -c "$OHA_CORES" oha -z ${DURATION}s -c $CONNECTIONS "${req[@]}" --no-tui --output-format json \
  --db-url "$work/requests.db" "$url" > "$work/summary.json" 2>/dev/null
wait $sampler
end=$(python3 -c "print($start + $DURATION)")
psql "$DATABASE_URL" -tAc "SELECT coalesce(json_agg(s ORDER BY s.calls DESC), '[]') FROM (SELECT query, calls, \
  round(total_exec_time::numeric, 1) AS total_ms FROM pg_stat_statements WHERE dbid = (SELECT oid FROM pg_database \
  WHERE datname = 'bench') AND query NOT LIKE '%pg_stat_statements%') s" > "$work/statements.json"
echo "$SERVER_CORES" > "$work/cores"
sleep 2 # let Prometheus take its last scrape of this run
python3 summarize_run.py "$work" "$DURATION" "$start" "$end" "$name" "$route" "results/${name}_${route}_run${run}.json"
