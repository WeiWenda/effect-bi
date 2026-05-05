-- ETL Airflow DAG deployments: separate from Neo4j lineage dag_views (table dependency graph).
-- Each row records one publish of an ETL task version (etl_task_versions row) to the Airflow dags folder.
CREATE TABLE IF NOT EXISTS etl_airflow_deployments (
  id SERIAL PRIMARY KEY,
  etl_task_version_id INTEGER NOT NULL REFERENCES etl_task_versions(id) ON DELETE CASCADE,
  airflow_dag_id VARCHAR(512) NOT NULL,
  logical_task_name VARCHAR(256) NOT NULL,
  generator VARCHAR(64) NOT NULL DEFAULT 'python_task_sdk',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_etl_airflow_deployments_version
  ON etl_airflow_deployments (etl_task_version_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_etl_airflow_deployments_dag_id
  ON etl_airflow_deployments (airflow_dag_id);