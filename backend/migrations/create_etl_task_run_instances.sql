-- Airflow ETL task tries (retries); lineage runs stay in task_instances
CREATE TABLE IF NOT EXISTS etl_task_run_instances (
  id SERIAL PRIMARY KEY,
  etl_task_version_id INTEGER NOT NULL REFERENCES etl_task_versions(id) ON DELETE CASCADE,
  table_partition_id BIGINT REFERENCES etl_table_partition_detail(id) ON DELETE SET NULL,
  partition_date DATE NOT NULL,
  attempt INTEGER NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'running')),
  airflow_dag_id VARCHAR(512) NOT NULL,
  airflow_run_id VARCHAR(512) NOT NULL,
  airflow_task_id VARCHAR(512) NOT NULL,
  airflow_try_number INTEGER,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_etl_task_run_instances_airflow_try UNIQUE (
    etl_task_version_id, airflow_dag_id, airflow_run_id, airflow_task_id, airflow_try_number
  )
);

CREATE INDEX IF NOT EXISTS idx_etl_task_run_instances_version_partition
  ON etl_task_run_instances (etl_task_version_id, partition_date DESC);

CREATE INDEX IF NOT EXISTS idx_etl_task_run_instances_airflow_run
  ON etl_task_run_instances (airflow_dag_id, airflow_run_id);

CREATE INDEX IF NOT EXISTS idx_etl_task_run_instances_partition_fk
  ON etl_task_run_instances (table_partition_id);

CREATE OR REPLACE FUNCTION update_etl_task_run_instances_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_etl_task_run_instances_updated_at'
  ) THEN
    CREATE TRIGGER update_etl_task_run_instances_updated_at
      BEFORE UPDATE ON etl_task_run_instances
      FOR EACH ROW
      EXECUTE FUNCTION update_etl_task_run_instances_updated_at();
  END IF;
END $$;
