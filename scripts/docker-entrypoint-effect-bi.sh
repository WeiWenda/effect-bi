#!/bin/sh
set -e
cd /app

echo "Running Node/Postgres migrations (backend/node/migrations)..."
node dist/migrate.js

exec "$@"
