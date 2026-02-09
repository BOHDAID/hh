-- Drop old constraint and add new one with all payment methods
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check 
CHECK (payment_method = ANY (ARRAY['wallet', 'stripe', 'crypto', 'manual', 'nowpayments', 'paypal']));