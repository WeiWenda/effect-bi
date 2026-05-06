import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './config/postgres.js';

/** Ordered list — keep in sync with `scripts/run-migration.ts` comments / history. */
export const NODE_PG_MIGRATION_FILES: readonly string[] = [
  'create_dag_views.sql',
  'create_etl_task_info.sql',
  'create_cube_versions.sql',
  'create_charts.sql',
  'create_dashboard_folders.sql',
  'create_dashboards.sql',
  'create_dashboard_charts.sql',
  'create_etl_adhoc.sql',
  'create_etl_task_versions.sql',
  'create_etl_airflow_deployments.sql',
  'create_etl_folders.sql',
  'create_etl_table_partition_detail.sql',
  'create_etl_task_run_instances.sql',
  'create_etl_alert_dispatch.sql',
];

/**
 * Apply SQL files under `backend/node/migrations` (idempotent-friendly DDL where possible).
 * Call from CLI (`migrate.ts`) or tooling; ends the pool when finished.
 */
export async function runMigrations(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.join(here, '../migrations');

  const client = await pool.connect();
  try {
    for (const migrationFile of NODE_PG_MIGRATION_FILES) {
      const migrationPath = path.join(migrationsDir, migrationFile);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      console.log('Running migration:', migrationPath);
      await client.query(sql);
      console.log('Migration completed successfully:', migrationFile);
    }
  } finally {
    client.release();
    await pool.end();
  }
}
