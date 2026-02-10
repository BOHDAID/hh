
-- Add account_password column to osn_sessions for storing ChatGPT account passwords
ALTER TABLE public.osn_sessions ADD COLUMN IF NOT EXISTS account_password TEXT;
