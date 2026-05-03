-- Ad-hoc SQL debug sessions and submission history
CREATE TABLE IF NOT EXISTS etl_adhoc_sessions (
  id SERIAL PRIMARY KEY,
  title VARCHAR(512) NOT NULL DEFAULT '',
  draft_sql TEXT NOT NULL DEFAULT '',
  default_context JSONB NOT NULL DEFAULT '{}',
  user_id VARCHAR(128),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_etl_adhoc_sessions_updated
  ON etl_adhoc_sessions (updated_at DESC);

CREATE TABLE IF NOT EXISTS etl_adhoc_submissions (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES etl_adhoc_sessions(id) ON DELETE CASCADE,
  sql_text TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  error_message TEXT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,
  duration_ms INTEGER,
  rows_returned INTEGER,
  result_schema_json JSONB,
  result_preview_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_etl_adhoc_submissions_session_time
  ON etl_adhoc_submissions (session_id, submitted_at DESC);

CREATE OR REPLACE FUNCTION update_etl_adhoc_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_etl_adhoc_sessions_updated_at'
  ) THEN
    CREATE TRIGGER update_etl_adhoc_sessions_updated_at
      BEFORE UPDATE ON etl_adhoc_sessions
      FOR EACH ROW
      EXECUTE FUNCTION update_etl_adhoc_sessions_updated_at();
  END IF;
END $$;
