-- Create dashboards table
CREATE TABLE IF NOT EXISTS dashboards (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  folder_id INTEGER REFERENCES dashboard_folders(id) ON DELETE SET NULL,
  filters JSONB NOT NULL DEFAULT '[]',
  layout JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dashboards_folder ON dashboards(folder_id);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dashboards_updated_at()
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
    WHERE tgname = 'update_dashboards_updated_at'
  ) THEN
    CREATE TRIGGER update_dashboards_updated_at
      BEFORE UPDATE ON dashboards
      FOR EACH ROW
      EXECUTE FUNCTION update_dashboards_updated_at();
  END IF;
END $$;
