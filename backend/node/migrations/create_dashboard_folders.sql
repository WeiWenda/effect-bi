-- Create dashboard_folders table
CREATE TABLE IF NOT EXISTS dashboard_folders (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  parent_id INTEGER REFERENCES dashboard_folders(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dashboard_folders_updated_at()
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
    WHERE tgname = 'update_dashboard_folders_updated_at'
  ) THEN
    CREATE TRIGGER update_dashboard_folders_updated_at
      BEFORE UPDATE ON dashboard_folders
      FOR EACH ROW
      EXECUTE FUNCTION update_dashboard_folders_updated_at();
  END IF;
END $$;
