-- Add model_json, model_yml, model_view columns to cube_versions
-- Replace the old yaml_content field with 3 separate fields

-- Add new columns
ALTER TABLE cube_versions ADD COLUMN IF NOT EXISTS model_json JSONB NOT NULL DEFAULT '[]';
ALTER TABLE cube_versions ADD COLUMN IF NOT EXISTS model_yml TEXT NOT NULL DEFAULT '';
ALTER TABLE cube_versions ADD COLUMN IF NOT EXISTS model_view TEXT NOT NULL DEFAULT '';

-- Migrate existing yaml_content data to model_json (if column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'cube_versions' AND column_name = 'yaml_content') THEN
    UPDATE cube_versions SET model_json = yaml_content::jsonb WHERE yaml_content != '' AND model_json = '[]'::jsonb;
  END IF;
END $$;

-- Drop old column
-- ALTER TABLE cube_versions DROP COLUMN IF EXISTS yaml_content;
