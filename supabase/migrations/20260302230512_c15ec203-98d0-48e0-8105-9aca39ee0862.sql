-- Allow admins to view all telegram sessions
CREATE POLICY "Admins can view all telegram sessions"
ON public.telegram_sessions
FOR SELECT
TO authenticated
USING (has_admin_access(auth.uid()));
