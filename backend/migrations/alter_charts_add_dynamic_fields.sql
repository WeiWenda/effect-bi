-- Add dynamic filter and drilldown columns to charts table
ALTER TABLE charts 
  ADD COLUMN IF NOT EXISTS dynamic_filters JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS drilldown_config JSONB DEFAULT NULL;

-- Create index for faster queries on dynamic fields
CREATE INDEX IF NOT EXISTS idx_charts_dynamic_filters ON charts USING GIN(dynamic_filters);
CREATE INDEX IF NOT EXISTS idx_charts_drilldown_config ON charts USING GIN(drilldown_config);
