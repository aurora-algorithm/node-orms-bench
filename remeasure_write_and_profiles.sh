#!/bin/bash
# Test 3's five setups as one session and Drizzle's four profiles in one sitting, run from the Mac.
# Prisma's write bar was measured after the main session (prisma.ts changed; rewrite.log), so it was compared with runs
# from another session; test one's and test four's profiles were taken ten days apart.
# Writes results/session-write/, the */write entries of summary.json, and profiles/drizzle{,-prep}_{one,feed}.*.
set -euo pipefail
cd "$(dirname "$0")"
SESSION=results/session-write
rig() { docker exec -u dev longs-rig bash -lc "cd ~/ormbench && $1"; }

echo "bench write session and profiles ($$)" > .bench.lock
trap 'rm -f .bench.lock' EXIT

./sync_in.sh
rig "pkill -f '[d]ist/apps/server.js' || true; pkill -x oha || true; rm -f results/*_run*.json; npm run -s build; python3 verify.py"
CHECK="node-pg write,kysely write,drizzle write,prisma write,typeorm write" SESSION_PREFIX="" ./run_all.sh

mkdir -p "$SESSION"
docker exec -u dev longs-rig tar -C /home/dev/ormbench/results -cf - . | tar -xf - -C "$SESSION"
python3 summarize_session.py "$SESSION" > "$SESSION/summary.json"
python3 - "$SESSION/summary.json" <<'PY'
import json, sys
fresh = json.load(open(sys.argv[1]))["configs"]
summary = json.load(open("summary.json"))
assert sorted(fresh) == sorted(k for k in summary["configs"] if k.endswith("/write")), sorted(fresh)
summary["configs"] = {**summary["configs"], **fresh}
json.dump(summary, open("summary.json", "w"), indent=1)
open("summary.json", "a").write("\n")
PY

for config in "drizzle one" "drizzle-prep one" "drizzle feed" "drizzle-prep feed"; do
  read -r app route <<< "$config"
  rig "./profile_one.sh $app $route"
  docker cp "longs-rig:/home/dev/ormbench/profiles/${app}_${route}.cpuprofile" "profiles/${app}_${route}.cpuprofile"
  python3 analyze_profile.py "profiles/${app}_${route}.cpuprofile" 25 --json "profiles/${app}_${route}.json" | head -4
done
echo REMEASURE_DONE
