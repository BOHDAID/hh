-- Add price per extra session to telegram_plans
ALTER TABLE public.telegram_plans 
ADD COLUMN price_per_extra_session numeric NOT NULL DEFAULT 5;

-- Update all existing plans to default 1 session
UPDATE public.telegram_plans SET max_sessions = 1 WHERE max_sessions != 1;
