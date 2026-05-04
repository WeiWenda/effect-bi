-- 已有库升级：从 catalog / schema_name / database_name / table_name 归一为 catalog / database_name(中间层) / table_name
-- 新库请直接执行 create_etl_task_info.sql、create_etl_table_partition_detail.sql，勿重复执行本文件。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'etl_task_info' AND column_name = 'schema_name'
  ) THEN
    UPDATE etl_task_info SET
      catalog_name = NULLIF(TRIM(COALESCE(NULLIF(catalog_name, ''), NULLIF(database_name, ''))), ''),
      database_name = NULLIF(TRIM(COALESCE(NULLIF(schema_name, ''), NULLIF(database_name, ''))), ''),
      table_name = NULLIF(TRIM(table_name), '');
    ALTER TABLE etl_task_info DROP COLUMN schema_name;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'etl_table_partition_detail' AND column_name = 'schema_name'
  ) THEN
    ALTER TABLE etl_table_partition_detail DROP CONSTRAINT IF EXISTS etl_table_partition_detail_unique;
    DROP INDEX IF EXISTS idx_etl_table_partition_detail_lookup;
    UPDATE etl_table_partition_detail SET
      catalog_name = NULLIF(TRIM(COALESCE(NULLIF(catalog_name, ''), NULLIF(database_name, ''))), ''),
      database_name = NULLIF(TRIM(COALESCE(NULLIF(schema_name, ''), NULLIF(database_name, ''))), ''),
      table_name = NULLIF(TRIM(table_name), '');
    ALTER TABLE etl_table_partition_detail DROP COLUMN schema_name;
    ALTER TABLE etl_table_partition_detail ADD CONSTRAINT etl_table_partition_detail_unique
      UNIQUE (catalog_name, database_name, table_name, primary_partition_key, secondary_partition_key);
    CREATE INDEX IF NOT EXISTS idx_etl_table_partition_detail_lookup
      ON etl_table_partition_detail (catalog_name, database_name, table_name, primary_partition_key);
  END IF;
END $$;
