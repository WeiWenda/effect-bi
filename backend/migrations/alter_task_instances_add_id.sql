-- Incremental migration: add SERIAL PRIMARY KEY to existing task_instances table

-- 1. Add id column with auto-increment sequence
ALTER TABLE task_instances ADD COLUMN IF NOT EXISTS id SERIAL;

-- 2. Drop the old composite primary key
ALTER TABLE task_instances DROP CONSTRAINT IF EXISTS task_instances_pkey;

-- 3. Set id as the new primary key
ALTER TABLE task_instances ADD PRIMARY KEY (id);

-- 4. Add unique constraint on the former composite key columns (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'task_instances_task_file_partition_date_attempt_unique') THEN
    ALTER TABLE task_instances ADD CONSTRAINT task_instances_task_file_partition_date_attempt_unique
      UNIQUE (task_file, partition_date, attempt);
  END IF;
END $$;
