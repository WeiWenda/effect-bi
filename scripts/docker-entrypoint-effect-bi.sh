#!/bin/sh
set -e
cd /app

echo "Running Node/Postgres migrations (npm run migrate:dist)..."
npm run migrate:dist
# PostgreSQL schema demo.*（等价于本地 npm run mock-table；生产用编译产物）
echo "Seeding PostgreSQL demo schema (npm run mock-table:dist)..."
npm run mock-table:dist

exec "$@"
