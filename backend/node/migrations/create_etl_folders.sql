-- ETL workspace folder tree (mirrors dashboard_folders shape) and logical task placement
CREATE TABLE IF NOT EXISTS etl_folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  parent_id INTEGER REFERENCES etl_folders(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Default root folder when none exist
INSERT INTO etl_folders (name, parent_id, sort_order)
SELECT '未分类', NULL, 0
WHERE NOT EXISTS (SELECT 1 FROM etl_folders);
