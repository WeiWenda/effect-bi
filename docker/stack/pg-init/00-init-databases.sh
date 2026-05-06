#!/bin/sh
set -eu
# First-time init for pgvector image: extra DBs + pgvector extension (runs as POSTGRES_USER).

for db in langgraph lineage; do
  if ! psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE \"${db}\";"
  fi
done

for db in langgraph lineage; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" -c "CREATE EXTENSION IF NOT EXISTS vector;"
done
