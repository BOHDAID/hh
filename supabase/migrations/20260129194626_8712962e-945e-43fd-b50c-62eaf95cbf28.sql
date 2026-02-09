-- Drop the existing payment_status check constraint and add one that includes awaiting_payment
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
CHECK (payment_status IS NULL OR payment_status IN ('pending', 'paid', 'failed', 'refunded', 'awaiting_payment', 'confirmed'));