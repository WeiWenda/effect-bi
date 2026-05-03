-- ETL task development versions (Airflow DAG source of truth in DB; files on publish)
CREATE TABLE IF NOT EXISTS etl_task_versions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  remark TEXT,
  is_published BOOLEAN DEFAULT false,
  graph_json JSONB NOT NULL DEFAULT '{}',
  sql_main TEXT NOT NULL DEFAULT '',
  airflow_options_json JSONB NOT NULL DEFAULT '{}',
  quality_rules_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_etl_task_versions_published
  ON etl_task_versions(name) WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_etl_task_versions_name_created
  ON etl_task_versions(name, created_at DESC);

CREATE OR REPLACE FUNCTION update_etl_task_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_etl_task_versions_updated_at'
  ) THEN
    CREATE TRIGGER update_etl_task_versions_updated_at
      BEFORE UPDATE ON etl_task_versions
      FOR EACH ROW
      EXECUTE FUNCTION update_etl_task_versions_updated_at();
  END IF;
END $$;
