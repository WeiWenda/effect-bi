import dotenv from 'dotenv';

dotenv.config();

/**
 * Legacy script: previously synced Neo4j HiveTable nodes into `task_info`.
 * Schema now uses `etl_task_info` for ETL logical tasks (managed via the ETL API).
 * Lineage DAG views read `task_instances` + Neo4j; no bulk PG sync is performed here.
 */
async function main(): Promise<void> {
  console.log(
    'initial-task-info: skipped — task_info was removed; use POST /api/etl/tasks/versions to create etl_task_info + etl_task_version rows.'
  );
}

main().catch(console.error);
