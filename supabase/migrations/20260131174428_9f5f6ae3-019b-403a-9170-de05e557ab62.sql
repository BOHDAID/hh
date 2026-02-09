-- ============================================================
-- Security Fix: Ensure sensitive settings are properly flagged
-- and change default to is_sensitive = true (secure by default)
-- ============================================================

-- Update known sensitive keys to is_sensitive = true
UPDATE public.site_settings 
SET is_sensitive = true 
WHERE key IN (
  'smtp_pass', 
  'smtp_user',
  'paypal_client_secret',
  'paypal_secret',
  'nowpayments_api_key',
  'nowpayments_ipn_secret',
  'lemonsqueezy_api_key',
  'remove_bg_api_key',
  'ltc_xpub',
  'resend_api_key',
  'stripe_secret_key',
  'blockcypher_token'
);

-- Change default value for is_sensitive to true (secure by default)
ALTER TABLE public.site_settings 
ALTER COLUMN is_sensitive SET DEFAULT true;

-- Add a comment explaining the security policy
COMMENT ON COLUMN public.site_settings.is_sensitive IS 'Default true (secure by default). Set to false only for public settings like store_name, store_logo_url, etc.';