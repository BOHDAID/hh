
-- Drop existing restrictive policy
DROP POLICY IF EXISTS "Admins can manage OSN sessions" ON public.osn_sessions;

-- Allow all operations on osn_sessions (auth is handled by external Supabase)
CREATE POLICY "Allow all operations on osn_sessions"
ON public.osn_sessions
FOR ALL
USING (true)
WITH CHECK (true);
