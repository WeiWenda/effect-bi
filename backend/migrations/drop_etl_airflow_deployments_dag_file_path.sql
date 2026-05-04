-- Remove persisted DAG file path (derive from dag id + dags dir when needed).
ALTER TABLE etl_airflow_deployments DROP COLUMN IF EXISTS dag_file_path;
