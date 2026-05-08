import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { pool } from '../config/postgres.js';

/** Ordered list of SQL files under `migrations/` (add new DDL here). */
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
 * Run as CLI: `tsx src/cli/runMigrations.ts` / `node dist/cli/runMigrations.js`.
 * Import `runMigrations` from elsewhere for tooling; ends the pool when finished.
 */
export async function runMigrations(): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.join(here, '../../migrations');

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

const isMainCli =
  typeof process.argv[1] === 'string' &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainCli) {
  runMigrations().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
