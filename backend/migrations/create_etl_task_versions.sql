-- One row per saved/published ETL definition; references logical task in etl_task_info
-- 产出表在 etl_task_info；JSON：schedule / alert / runtime_deps / quality
CREATE TABLE IF NOT EXISTS etl_task_versions (
  id SERIAL PRIMARY KEY,
  etl_task_id INTEGER NOT NULL REFERENCES etl_task_info(id) ON DELETE CASCADE,
  remark TEXT,
  is_published BOOLEAN DEFAULT false,
  sql_main TEXT NOT NULL DEFAULT '',
  schedule_json JSONB NOT NULL DEFAULT '{}',
  alert_json JSONB NOT NULL DEFAULT '{}',
  runtime_deps_json JSONB NOT NULL DEFAULT '{}',
  quality_rules_json JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_etl_task_versions_published
  ON etl_task_versions (etl_task_id)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_etl_task_versions_task_created
  ON etl_task_versions (etl_task_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_etl_task_versions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
