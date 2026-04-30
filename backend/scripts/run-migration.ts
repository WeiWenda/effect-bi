import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { pool } from '../src/config/postgres.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const migrationsDir = path.join(__dirname, '../migrations');
  const migrationFiles = [
    'create_dag_views.sql',
    'create_task_instances.sql',
    'create_task_info.sql',
    'create_cube_versions.sql',
    'alter_cube_versions_add_model_fields.sql',
    'alter_task_instances_add_id.sql',
    'create_charts.sql',
    'create_dashboard_folders.sql',
    'create_dashboards.sql',
    'create_dashboard_charts.sql'
  ];

  const client = await pool.connect();
  try {
    for (const migrationFile of migrationFiles) {
      const migrationPath = path.join(migrationsDir, migrationFile);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      console.log('Running migration:', migrationPath);

      await client.query(sql);
      console.log('Migration completed successfully:', migrationFile);
    }
  } catch (error) {
    console.error('Error running migration:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
