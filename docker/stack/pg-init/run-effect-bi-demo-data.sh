#!/bin/sh
# Runs after effect-bi is healthy (Node migrations applied). Idempotent: skips if etl_folders id=1 exists.
set -eu

export PGHOST="${PGHOST:-pgvector}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-stack}"
export PGPASSWORD="${PGPASSWORD:?PGPASSWORD is required}"
export PGDATABASE="${PGDATABASE:-lineage}"

SQL_FILE="${EFFECT_BI_DEMO_SQL_FILE:-/insert-demo-data.sql}"

echo "effect-bi-init: waiting for ${PGHOST}:${PGPORT} database ${PGDATABASE}..."
i=0
while [ "$i" -lt 90 ]; do
  if psql -q -c 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 2
done
if [ "$i" -ge 90 ]; then
  echo "effect-bi-init: timeout waiting for Postgres"
  exit 1
fi

if ! psql -q -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'etl_folders'" | grep -q 1; then
  echo "effect-bi-init: public.etl_folders missing (migrations not applied?)."
  exit 1
fi

if psql -q -tAc "SELECT EXISTS (SELECT 1 FROM public.etl_folders WHERE id = 1)" | grep -q t; then
  echo "effect-bi-init: demo seed already applied (etl_folders id=1), skipping."
  exit 0
fi

if [ ! -r "$SQL_FILE" ]; then
  echo "effect-bi-init: SQL file not found: $SQL_FILE"
  exit 1
fi

echo "effect-bi-init: applying $SQL_FILE ..."
psql -v ON_ERROR_STOP=1 -f "$SQL_FILE"
echo "effect-bi-init: done."
