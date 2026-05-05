-- Create dashboards table
CREATE TABLE IF NOT EXISTS dashboards (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  folder_id INTEGER REFERENCES dashboard_folders(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  filters JSONB NOT NULL DEFAULT '[]',
  layout JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dashboards_folder ON dashboards(folder_id);