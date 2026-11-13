#!/bin/bash
# Inside the rig, once per session (safe to re-run): packages and build, the bench database with pg_stat_statements,
# Postgres pinned to its cores, the monitoring stack, and a check that every app answers the same way.
set -euo pipefail
cd "$(dirname "$0")"
source cores.sh
export DATABASE_URL=${DATABASE_URL:-postgres://dev:dev@127.0.0.1/bench}
[ -d node_modules ] || npm ci --silent || npm install --silent
npm run -s build
if [ "$(psql -d postgres -tAc 'show shared_preload_libraries')" != pg_stat_statements ]; then
  psql -d postgres -qc "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements'"
  sudo pg_ctlcluster 17 main restart
fi
if ! psql "$DATABASE_URL" -tAc 'select 1' >/dev/null 2>&1; then
  psql -d postgres -qc "ALTER ROLE dev PASSWORD 'dev'"
  createdb bench
  psql -q bench -f schema.sql
  psql -q bench -c 'CREATE EXTENSION pg_stat_statements'
fi
for p in $(pgrep -x postgres); do sudo taskset -apc "$POSTGRES_CORES" "$p" >/dev/null; done
python3 monitoring/make_dashboard.py >/dev/null
MONITOR_CORE=$MONITOR_CORES monitoring/up.sh
python3 verify.py
mkdir -p results
{ echo "node $(node --version)"
  node -e "for (const p of ['express','pg','kysely','drizzle-orm','@prisma/client','@prisma/adapter-pg','typeorm']) console.log(p, require('./node_modules/'+p+'/package.json').version)"
  oha --version
  psql "$DATABASE_URL" -tAc 'show server_version' | sed 's/^/postgres /'
  echo "cores: node $SERVER_CORES, oha $OHA_CORES, postgres $POSTGRES_CORES, monitoring $MONITOR_CORES"
} > results/versions.txt
cat results/versions.txt
