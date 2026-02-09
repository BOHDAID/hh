-- Add payment gateway settings
INSERT INTO public.site_settings (key, value, category) VALUES
  ('nowpayments_api_key', NULL, 'payment'),
  ('nowpayments_ipn_secret', NULL, 'payment'),
  ('paypal_client_id', NULL, 'payment'),
  ('paypal_client_secret', NULL, 'payment'),
  ('paypal_mode', 'sandbox', 'payment')
ON CONFLICT (key) DO NOTHING;