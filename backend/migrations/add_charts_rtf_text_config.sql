-- 文本图表（RTF）：插值表达式与字体样式（JSON）
ALTER TABLE charts ADD COLUMN IF NOT EXISTS rtf_text_config JSONB;
