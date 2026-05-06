#!/bin/sh
# One-shot: create metalake + JDBC Postgres catalog (idempotent; 409 = already exists).
# Required env: see docker-compose (GRAVITINO_API_BASE, METALAKE_NAME, PG_*, etc.)
set -eu

GRAVITINO_API_BASE="${GRAVITINO_API_BASE:-http://gravitino:8090/api}"
METALAKE_NAME="${METALAKE_NAME:-effectbi}"
PG_CATALOG_NAME="${PG_CATALOG_NAME:-localpg}"
PG_HOST="${PG_HOST:-pgvector}"
PG_PORT="${PG_PORT:-5432}"
PG_DATABASE="${PG_DATABASE:-lineage}"
PG_USER="${PG_USER:-stack}"
PG_PASSWORD="${PG_PASSWORD:-stacksecret}"

# Escape " and \ for JSON string values
escape_json_string() {
  printf '%s' "$1" | sed 's/\\/\\\\/g;s/"/\\"/g'
}

PW_ESC="$(escape_json_string "$PG_PASSWORD")"
JDBC_URL="jdbc:postgresql://${PG_HOST}:${PG_PORT}/${PG_DATABASE}"

echo "Waiting for Gravitino REST ($GRAVITINO_API_BASE)..."
attempt=0
max_attempts=90
while [ "$attempt" -lt "$max_attempts" ]; do
  if curl -fsS -H 'Accept: application/vnd.gravitino.v1+json' \
    "${GRAVITINO_API_BASE}/metalakes" >/dev/null 2>&1; then
    echo "Gravitino API is up."
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done
if [ "$attempt" -ge "$max_attempts" ]; then
  echo "Timeout: Gravitino API not ready."
  exit 1
fi

echo "POST ${GRAVITINO_API_BASE}/metalakes ($METALAKE_NAME)"
mcode=$(curl -sS -o /tmp/ml.json -w "%{http_code}" -X POST "${GRAVITINO_API_BASE}/metalakes" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/vnd.gravitino.v1+json' \
  -d "{\"name\":\"${METALAKE_NAME}\",\"comment\":\"auto (docker stack gravitino-init)\"}" || echo "000")
case "$mcode" in
  200|201|409) echo "metalake: HTTP $mcode" ;;
  *) echo "metalake failed: HTTP $mcode"; cat /tmp/ml.json 2>/dev/null || true; exit 1 ;;
esac

BODY="{\"name\":\"${PG_CATALOG_NAME}\",\"type\":\"relational\",\"provider\":\"jdbc-postgresql\",\"comment\":\"pgvector lineage\",\"properties\":{\"jdbc-url\":\"${JDBC_URL}\",\"jdbc-driver\":\"org.postgresql.Driver\",\"jdbc-database\":\"${PG_DATABASE}\",\"jdbc-user\":\"${PG_USER}\",\"jdbc-password\":\"${PW_ESC}\"}}"

echo "POST catalog ${METALAKE_NAME}/${PG_CATALOG_NAME}"
ccode=$(curl -sS -o /tmp/cat.json -w "%{http_code}" -X POST \
  "${GRAVITINO_API_BASE}/metalakes/${METALAKE_NAME}/catalogs" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/vnd.gravitino.v1+json' \
  -d "$BODY" || echo "000")

case "$ccode" in
  200|201|409) echo "catalog: HTTP $ccode" ;;
  *) echo "catalog failed: HTTP $ccode"; cat /tmp/cat.json 2>/dev/null || true; exit 1 ;;
esac

echo "gravitino-init done."
