-- Create cube_versions table
CREATE TABLE IF NOT EXISTS cube_versions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL,
  remark TEXT,
  is_published BOOLEAN DEFAULT false,
  canvas_data JSONB NOT NULL DEFAULT '{}',
  field_list JSONB NOT NULL DEFAULT '[]',
  yaml_content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Only one published version per cube name
CREATE UNIQUE INDEX IF NOT EXISTS idx_cube_versions_published
  ON cube_versions(name) WHERE is_published = true;

-- Index for listing versions by name in reverse chronological order
CREATE INDEX IF NOT EXISTS idx_cube_versions_name_created
  ON cube_versions(name, created_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cube_versions_updated_at()
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
    WHERE tgname = 'update_cube_versions_updated_at'
  ) THEN
    CREATE TRIGGER update_cube_versions_updated_at
      BEFORE UPDATE ON cube_versions
      FOR EACH ROW
      EXECUTE FUNCTION update_cube_versions_updated_at();
  END IF;
END $$;
