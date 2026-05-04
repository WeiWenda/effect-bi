-- Partition output + verification + pipeline running state for ETL dependency checks
-- 三层元数据：catalog_name → database_name（中间层）→ table_name
CREATE TABLE IF NOT EXISTS etl_table_partition_detail (
  id BIGSERIAL PRIMARY KEY,
  catalog_name VARCHAR(256) NOT NULL,
  database_name VARCHAR(256) NOT NULL,
  table_name VARCHAR(256) NOT NULL,
  primary_partition_key VARCHAR(512) NOT NULL,
  secondary_partition_key VARCHAR(1024) NOT NULL DEFAULT '',
  etl_task_version_id INTEGER REFERENCES etl_task_versions(id) ON DELETE SET NULL,
  partition_date DATE NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT true,
  running_status VARCHAR(32) NOT NULL DEFAULT 'idle'
    CHECK (running_status IN ('idle', 'running', 'succeeded', 'quality_rejected', 'failed')),
  last_success_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE etl_table_partition_detail DROP CONSTRAINT IF EXISTS etl_table_partition_detail_unique;
ALTER TABLE etl_table_partition_detail ADD CONSTRAINT etl_table_partition_detail_unique
  UNIQUE (catalog_name, database_name, table_name, primary_partition_key, secondary_partition_key);

CREATE INDEX IF NOT EXISTS idx_etl_table_partition_detail_lookup
  ON etl_table_partition_detail (catalog_name, database_name, table_name, primary_partition_key);

CREATE INDEX IF NOT EXISTS idx_etl_table_partition_detail_verified
  ON etl_table_partition_detail (is_verified);

CREATE INDEX IF NOT EXISTS idx_etl_table_partition_detail_running_status
  ON etl_table_partition_detail (running_status);

CREATE OR REPLACE FUNCTION update_etl_table_partition_detail_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_etl_table_partition_detail_updated_at'
  ) THEN
    CREATE TRIGGER update_etl_table_partition_detail_updated_at
      BEFORE UPDATE ON etl_table_partition_detail
      FOR EACH ROW
      EXECUTE FUNCTION update_etl_table_partition_detail_updated_at();
  END IF;
END $$;
