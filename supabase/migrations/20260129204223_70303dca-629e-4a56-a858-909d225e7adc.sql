-- Add 'processing' to allowed status values
ALTER TABLE public.orders DROP CONSTRAINT orders_status_check;

ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
CHECK (status = ANY (ARRAY['pending', 'processing', 'completed', 'cancelled', 'refunded']));