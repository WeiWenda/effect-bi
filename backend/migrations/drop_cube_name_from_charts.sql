-- Drop cube_name column from charts table
-- Charts are now only associated with view_name

-- Drop the index first
DROP INDEX IF EXISTS idx_charts_cube_view;

-- Drop the column
ALTER TABLE charts DROP COLUMN IF EXISTS cube_name;

-- Create new index on view_name only
CREATE INDEX IF NOT EXISTS idx_charts_view ON charts(view_name);
