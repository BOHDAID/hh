-- Add missing crypto_fee_percent column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS crypto_fee_percent numeric DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.orders.crypto_fee_percent IS 'Percentage fee applied to crypto payments';