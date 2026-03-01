
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS reminder_sent boolean DEFAULT false;
ALTER TABLE public.cart_items ADD COLUMN IF NOT EXISTS reminder_sent_at timestamp with time zone DEFAULT NULL;
