#!/bin/sh
# Waits for Postgres, then for public.etl_folders (effect-bi migrations), then applies demo SQL once.
# Idempotency: dedicated table public.effect_bi_demo_seed — not business rows like etl_folders.id.
# Optional env EFFECT_BI_DEMO_SEED_ID (default effect_bi_compose_demo_v1): bump when insert-demo-data.sql changes incompatibly.
set -eu

export PGHOST="${PGHOST:-pgvector}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-stack}"
export PGPASSWORD="${PGPASSWORD:?PGPASSWORD is required}"
export PGDATABASE="${PGDATABASE:-lineage}"

SQL_FILE="${EFFECT_BI_DEMO_SQL_FILE:-/insert-demo-data.sql}"
DEMO_SEED_ID="${EFFECT_BI_DEMO_SEED_ID:-effect_bi_compose_demo_v1}"

case "$DEMO_SEED_ID" in
  '' | *[!a-zA-Z0-9_]*)
    echo "effect-bi-init: EFFECT_BI_DEMO_SEED_ID must be non-empty alphanumeric + underscore only."
    exit 1
    ;;
esac

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

echo "effect-bi-init: waiting for public.etl_folders (effect-bi migrations must finish first)..."
j=0
while [ "$j" -lt 150 ]; do
  if psql -q -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'etl_folders'" | grep -q 1; then
    break
  fi
  j=$((j + 1))
  sleep 2
done
if [ "$j" -ge 150 ]; then
  echo "effect-bi-init: timeout waiting for public.etl_folders — ensure effect-bi is running and migrations completed."
  exit 1
fi

psql -v ON_ERROR_STOP=1 -q -c "
CREATE TABLE IF NOT EXISTS public.effect_bi_demo_seed (
  seed_id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
"

if psql -q -tAc "SELECT EXISTS (SELECT 1 FROM public.effect_bi_demo_seed WHERE seed_id = '$DEMO_SEED_ID')" | grep -q t; then
  echo "effect-bi-init: demo seed already applied (seed_id=${DEMO_SEED_ID}), skipping."
  exit 0
fi

if [ ! -r "$SQL_FILE" ]; then
  echo "effect-bi-init: SQL file not found: $SQL_FILE"
  exit 1
fi

echo "effect-bi-init: applying $SQL_FILE (transaction + seed mark) ..."
{
  echo "BEGIN;"
  cat "$SQL_FILE"
  echo "INSERT INTO public.effect_bi_demo_seed (seed_id) VALUES ('$DEMO_SEED_ID');"
  echo "COMMIT;"
} | psql -v ON_ERROR_STOP=1 -q

echo "effect-bi-init: done."
