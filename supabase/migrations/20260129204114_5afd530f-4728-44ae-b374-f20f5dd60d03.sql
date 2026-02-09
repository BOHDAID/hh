-- Drop the old constraint and add a new one with 'wallet' included
ALTER TABLE public.orders DROP CONSTRAINT orders_payment_method_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check 
CHECK (payment_method IS NULL OR payment_method = ANY (ARRAY['paypal', 'nowpayments', 'litecoin_direct', 'manual', 'wallet']));

-- Also update payment_status to include 'completed' if not already there
ALTER TABLE public.orders DROP CONSTRAINT orders_payment_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
CHECK (payment_status IS NULL OR payment_status = ANY (ARRAY['pending', 'paid', 'failed', 'refunded', 'awaiting_payment', 'confirmed', 'completed']));