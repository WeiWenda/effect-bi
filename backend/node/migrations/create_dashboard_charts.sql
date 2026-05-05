-- Create dashboard_charts association table
CREATE TABLE IF NOT EXISTS dashboard_charts (
  id SERIAL PRIMARY KEY,
  dashboard_id INTEGER NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  chart_id INTEGER NOT NULL REFERENCES charts(id) ON DELETE CASCADE,
  position JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(dashboard_id, chart_id)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_charts_dashboard ON dashboard_charts(dashboard_id);
