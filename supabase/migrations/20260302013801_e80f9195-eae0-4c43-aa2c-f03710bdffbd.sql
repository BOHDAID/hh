
CREATE TABLE public.admin_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view activity logs"
  ON public.admin_activity_logs
  FOR SELECT
  USING (has_admin_access(auth.uid()));

CREATE POLICY "Admins can insert activity logs"
  ON public.admin_activity_logs
  FOR INSERT
  WITH CHECK (has_admin_access(auth.uid()));

CREATE INDEX idx_admin_activity_logs_created_at ON public.admin_activity_logs(created_at DESC);
CREATE INDEX idx_admin_activity_logs_user_id ON public.admin_activity_logs(user_id);
CREATE INDEX idx_admin_activity_logs_target_type ON public.admin_activity_logs(target_type);
