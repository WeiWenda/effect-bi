-- Create task run instances table
CREATE TABLE IF NOT EXISTS task_instances (
  id SERIAL PRIMARY KEY,
  task_file VARCHAR(512) NOT NULL,
  partition_date DATE NOT NULL,
  attempt INTEGER NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed', 'running')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(task_file, partition_date, attempt)
);

-- Create index on task_file for faster lookups
CREATE INDEX IF NOT EXISTS idx_task_instances_task_file ON task_instances(task_file);

-- Create index on partition_date for filtering
CREATE INDEX IF NOT EXISTS idx_task_instances_partition_date ON task_instances(partition_date DESC);

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_task_instances_status ON task_instances(status);

-- Create index on start_time for sorting
CREATE INDEX IF NOT EXISTS idx_task_instances_start_time ON task_instances(start_time DESC);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_task_instances_updated_at()
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
    WHERE tgname = 'update_task_instances_updated_at'
  ) THEN
    CREATE TRIGGER update_task_instances_updated_at
      BEFORE UPDATE ON task_instances
      FOR EACH ROW
      EXECUTE FUNCTION update_task_instances_updated_at();
  END IF;
END $$;
