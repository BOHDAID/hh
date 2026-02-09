-- Add columns for crypto payment tracking
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS payment_address TEXT,
ADD COLUMN IF NOT EXISTS crypto_index INTEGER,
ADD COLUMN IF NOT EXISTS ltc_amount NUMERIC,
ADD COLUMN IF NOT EXISTS confirmations INTEGER DEFAULT 0;

-- Create a sequence for crypto address derivation index
CREATE SEQUENCE IF NOT EXISTS crypto_address_index_seq START 1;

-- Create index for faster payment address lookups
CREATE INDEX IF NOT EXISTS idx_orders_payment_address ON public.orders(payment_address) WHERE payment_address IS NOT NULL;