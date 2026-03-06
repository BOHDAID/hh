-- Allow multiple Telegram sessions per user while preventing duplicate same-session rows
ALTER TABLE public.telegram_sessions
DROP CONSTRAINT IF EXISTS telegram_sessions_user_id_key;

-- Ensure each user cannot save the same session_string twice
CREATE UNIQUE INDEX IF NOT EXISTS telegram_sessions_user_id_session_string_key
ON public.telegram_sessions (user_id, session_string);

-- Improve per-user session lookup performance (latest first)
CREATE INDEX IF NOT EXISTS telegram_sessions_user_id_updated_at_idx
ON public.telegram_sessions (user_id, updated_at DESC);