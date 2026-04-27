-- Create task_info table
CREATE TABLE IF NOT EXISTS task_info (
  id SERIAL PRIMARY KEY,
  neo4j_node_id VARCHAR(128) NOT NULL,
  task_file VARCHAR(512),
  table_name VARCHAR(256),
  layer VARCHAR(64),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(neo4j_node_id)
);

-- Create index on neo4j_node_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_task_info_neo4j_node_id ON task_info(neo4j_node_id);

-- Create index on task_file for faster lookups
CREATE INDEX IF NOT EXISTS idx_task_info_task_file ON task_info(task_file);

-- Create index on table_name for search
CREATE INDEX IF NOT EXISTS idx_task_info_table_name ON task_info(table_name);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_task_info_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger only if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_task_info_updated_at'
  ) THEN
    CREATE TRIGGER update_task_info_updated_at
      BEFORE UPDATE ON task_info
      FOR EACH ROW
      EXECUTE FUNCTION update_task_info_updated_at();
  END IF;
END $$;
