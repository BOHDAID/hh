-- Add description column to site_settings
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS description text;

-- Add is_sensitive column to mark sensitive settings (for RLS)
ALTER TABLE public.site_settings ADD COLUMN IF NOT EXISTS is_sensitive boolean DEFAULT false;

-- Update existing sensitive keys
UPDATE public.site_settings SET is_sensitive = true WHERE key IN (
  'smtp_pass', 'paypal_client_secret', 'nowpayments_api_key', 'nowpayments_ipn_secret',
  'remove_bg_api_key', 'ltc_xpub', 'btc_xpub', 'crypto_merchant_api'
);

-- Insert new SMTP settings if they don't exist
INSERT INTO public.site_settings (key, value, category, description, is_sensitive)
VALUES 
  ('smtp_host', 'smtp.gmail.com', 'smtp', 'خادم SMTP', false),
  ('smtp_port', '465', 'smtp', 'منفذ SMTP', false),
  ('smtp_user', '', 'smtp', 'بريد Gmail للإرسال', false),
  ('smtp_pass', '', 'smtp', 'كلمة مرور التطبيقات', true),
  ('support_email', '', 'general', 'بريد الدعم الظاهر للعملاء', false),
  ('currency', 'USD', 'general', 'العملة الافتراضية', false),
  ('crypto_merchant_api', '', 'crypto', 'مفتاح API للمحفظة', true)
ON CONFLICT (key) DO NOTHING;

-- Drop existing RLS policies for site_settings
DROP POLICY IF EXISTS "Admins can manage site settings" ON public.site_settings;
DROP POLICY IF EXISTS "Anyone can view site settings" ON public.site_settings;

-- Create new RLS policies
-- Allow everyone to view non-sensitive settings
CREATE POLICY "Anyone can view non-sensitive settings"
ON public.site_settings
FOR SELECT
USING (is_sensitive = false OR is_admin(auth.uid()));

-- Only admins can manage all settings
CREATE POLICY "Admins can manage site settings"
ON public.site_settings
FOR ALL
USING (is_admin(auth.uid()));