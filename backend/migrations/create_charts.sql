-- Create charts table
CREATE TABLE IF NOT EXISTS charts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(256) NOT NULL DEFAULT '未命名图表',
  cube_name VARCHAR(256) NOT NULL,
  view_name VARCHAR(256) NOT NULL,
  chart_type VARCHAR(32) NOT NULL DEFAULT 'table',
  dimensions JSONB NOT NULL DEFAULT '[]',
  metrics JSONB NOT NULL DEFAULT '[]',
  filters JSONB NOT NULL DEFAULT '[]',
  sort JSONB NOT NULL DEFAULT '[]',
  "limit" INTEGER DEFAULT 500,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_charts_cube_view ON charts(cube_name, view_name);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_charts_updated_at()
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
    WHERE tgname = 'update_charts_updated_at'
  ) THEN
    CREATE TRIGGER update_charts_updated_at
      BEFORE UPDATE ON charts
      FOR EACH ROW
      EXECUTE FUNCTION update_charts_updated_at();
  END IF;
END $$;
