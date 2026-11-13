#!/bin/bash
# A CPU profile of one app under the route's load (a separate run, never measured): node --cpu-prof for 15 s.
# usage: profile_one.sh <app> <route>   -> profiles/<app>_<route>.cpuprofile
set -euo pipefail
cd "$(dirname "$0")"
source servers.sh
source cores.sh
name=$1; route=$2
port=$(port_of "$name")
path=$(route_path "$route")
mkdir -p profiles
work=$(mktemp -d)
ORM=$name setsid taskset -c "$SERVER_CORES" node --cpu-prof --cpu-prof-dir="$work" --import ./dist/apps/exit-on-signal.js dist/apps/server.js >/dev/null 2>&1 & pid=$!
for _ in $(seq 150); do curl -sf -o /dev/null "http://127.0.0.1:$port/users/1" && break; sleep 0.1; done
req=(--rand-regex-url); url="http://localhost:$port$path"
[ "$route" = write ] && { req=(-m POST -H "content-type: application/json" -d "$WRITE_BODY"); url="http://127.0.0.1:$port$path"; }
[[ $path != *'['* ]] && [ "$route" != write ] && { req=(); url="http://127.0.0.1:$port$path"; }
taskset -c "$OHA_CORES" oha -z 15s -c 64 "${req[@]}" --no-tui --output-format quiet "$url" >/dev/null
kill -INT "$pid"; wait "$pid" 2>/dev/null || true
mv "$work"/*.cpuprofile "profiles/${name}_${route}.cpuprofile"
rm -rf "$work"
[ "$route" != write ] || psql -q -d bench -c 'DELETE FROM posts WHERE id > 100000' -c 'DELETE FROM users WHERE id > 10000' >/dev/null
echo "profiles/${name}_${route}.cpuprofile"
