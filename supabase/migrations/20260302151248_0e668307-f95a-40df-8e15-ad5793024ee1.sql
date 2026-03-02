
CREATE TABLE public.login_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_type TEXT DEFAULT 'unknown',
  browser TEXT DEFAULT 'unknown',
  os TEXT DEFAULT 'unknown',
  ip_address TEXT,
  country TEXT,
  city TEXT,
  is_current BOOLEAN DEFAULT false,
  is_suspicious BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.login_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own login sessions" ON public.login_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON public.login_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Allow insert login sessions" ON public.login_sessions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can view all sessions" ON public.login_sessions
  FOR SELECT USING (is_admin(auth.uid()));

CREATE INDEX idx_login_sessions_user_id ON public.login_sessions(user_id);
CREATE INDEX idx_login_sessions_created_at ON public.login_sessions(created_at DESC);
