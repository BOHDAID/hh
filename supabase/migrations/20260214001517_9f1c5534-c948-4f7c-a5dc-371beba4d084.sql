-- Add unique constraint on key column in site_settings
ALTER TABLE public.site_settings ADD CONSTRAINT site_settings_key_unique UNIQUE (key);
