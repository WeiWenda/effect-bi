-- Add model_json, model_yml, model_view columns to cube_versions
-- Replace the old yaml_content field with 3 separate fields

-- Add new columns
ALTER TABLE cube_versions ADD COLUMN IF NOT EXISTS model_json JSONB NOT NULL DEFAULT '[]';
ALTER TABLE cube_versions ADD COLUMN IF NOT EXISTS model_yml TEXT NOT NULL DEFAULT '';
ALTER TABLE cube_versions ADD COLUMN IF NOT EXISTS model_view TEXT NOT NULL DEFAULT '';

-- Migrate existing yaml_content data to model_json
-- (yaml_content was stored as JSON string, so we can copy it directly)
UPDATE cube_versions SET model_json = yaml_content::jsonb WHERE yaml_content != '' AND model_json = '[]'::jsonb;

-- Drop old column
-- ALTER TABLE cube_versions DROP COLUMN IF EXISTS yaml_content;
