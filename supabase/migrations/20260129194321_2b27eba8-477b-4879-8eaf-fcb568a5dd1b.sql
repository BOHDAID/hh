-- Drop the existing check constraint and add a new one that includes litecoin_direct
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check 
CHECK (payment_method IS NULL OR payment_method IN ('paypal', 'nowpayments', 'litecoin_direct', 'manual'));