CREATE TABLE IF NOT EXISTS platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO platform_settings (key, value, description) VALUES
  ('platform_name', '"Pelikat Running Platform"', 'Display name of the platform'),
  ('support_email', '"support@pelikat.com"', 'Support contact email'),
  ('feature_virtual_run', 'true', 'Enable virtual run tracking'),
  ('feature_photo_ai', 'true', 'Enable AI photo processing'),
  ('feature_repc_collection', 'true', 'Enable REPC consent collection'),
  ('maintenance_mode', 'false', 'Put platform in maintenance mode')
ON CONFLICT (key) DO NOTHING;

CREATE INDEX idx_platform_settings_key ON platform_settings(key);
