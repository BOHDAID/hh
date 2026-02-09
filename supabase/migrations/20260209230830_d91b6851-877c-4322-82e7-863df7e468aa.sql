
-- Add Gmail SMTP fields to osn_sessions for OTP fetching
ALTER TABLE public.osn_sessions 
ADD COLUMN IF NOT EXISTS gmail_address text,
ADD COLUMN IF NOT EXISTS gmail_app_password text;
