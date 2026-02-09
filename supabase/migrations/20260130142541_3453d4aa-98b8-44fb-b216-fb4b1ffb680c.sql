-- Add expires_at column for payment timeout
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- Add partial payment tracking columns
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS received_amount NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS crypto_fee_percent NUMERIC DEFAULT 0;

-- Add default value for crypto_fee in site_settings if not exists
INSERT INTO public.site_settings (key, value, description, category, is_sensitive)
VALUES ('crypto_fee_percent', '3', 'نسبة رسوم الدفع بالعملات الرقمية (%)', 'payment', false)
ON CONFLICT (key) DO NOTHING;