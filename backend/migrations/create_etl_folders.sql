-- ETL workspace folder tree (mirrors dashboard_folders shape) and logical task placement
CREATE TABLE IF NOT EXISTS etl_folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  parent_id INTEGER REFERENCES etl_folders(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION update_etl_folders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_etl_folders_updated_at'
  ) THEN
    CREATE TRIGGER update_etl_folders_updated_at
      BEFORE UPDATE ON etl_folders
      FOR EACH ROW
      EXECUTE FUNCTION update_etl_folders_updated_at();
  END IF;
END $$;

-- One row per logical task name (matches etl_task_info.name); folder may be NULL = 未归类
CREATE TABLE IF NOT EXISTS etl_folder_tasks (
  id SERIAL PRIMARY KEY,
  folder_id INTEGER REFERENCES etl_folders(id) ON DELETE SET NULL,
  task_name VARCHAR(256) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_etl_folder_tasks_task_name UNIQUE (task_name)
);

CREATE INDEX IF NOT EXISTS idx_etl_folder_tasks_folder_sort
  ON etl_folder_tasks (folder_id, sort_order, task_name);

CREATE OR REPLACE FUNCTION update_etl_folder_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_etl_folder_tasks_updated_at'
  ) THEN
    CREATE TRIGGER update_etl_folder_tasks_updated_at
      BEFORE UPDATE ON etl_folder_tasks
      FOR EACH ROW
      EXECUTE FUNCTION update_etl_folder_tasks_updated_at();
  END IF;
END $$;

-- Default root folder when none exist
INSERT INTO etl_folders (name, parent_id, sort_order)
SELECT '未分类', NULL, 0
WHERE NOT EXISTS (SELECT 1 FROM etl_folders);

-- Backfill placement for existing logical task names
INSERT INTO etl_folder_tasks (folder_id, task_name, sort_order)
SELECT (SELECT id FROM etl_folders ORDER BY id LIMIT 1), x.name, 0
FROM (SELECT DISTINCT i.name FROM etl_task_info i INNER JOIN etl_task_versions v ON v.etl_task_id = i.id) AS x
ON CONFLICT (task_name) DO NOTHING;
