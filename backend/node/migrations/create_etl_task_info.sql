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
  -- 任务库目录树位置（外键在 create_etl_folders.sql 中 etl_folders 建表后补上）
  folder_id INTEGER,
  folder_sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_etl_task_info_name UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_etl_task_info_neo4j_node_id
  ON etl_task_info (neo4j_node_id)
  WHERE neo4j_node_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_etl_task_info_table_name ON etl_task_info (table_name);
