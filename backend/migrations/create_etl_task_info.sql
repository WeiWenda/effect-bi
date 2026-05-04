-- ETL logical task: version-agnostic identity, output table identity, ownership (Neo4j lineage link optional)
CREATE TABLE IF NOT EXISTS etl_task_info (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  neo4j_node_id VARCHAR(128),
  table_name VARCHAR(256),
  catalog_name VARCHAR(256),
  database_name VARCHAR(256),
  owner_name VARCHAR(256),
  owner_email VARCHAR(256),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_etl_task_info_name UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_etl_task_info_neo4j_node_id
  ON etl_task_info (neo4j_node_id)
  WHERE neo4j_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_etl_task_info_table_name ON etl_task_info (table_name);

CREATE OR REPLACE FUNCTION update_etl_task_info_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_etl_task_info_updated_at'
  ) THEN
    CREATE TRIGGER update_etl_task_info_updated_at
      BEFORE UPDATE ON etl_task_info
      FOR EACH ROW
      EXECUTE FUNCTION update_etl_task_info_updated_at();
  END IF;
END $$;
