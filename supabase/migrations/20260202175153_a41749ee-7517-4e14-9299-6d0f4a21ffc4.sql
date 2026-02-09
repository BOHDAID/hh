-- Drop the old SELECT policy (only for authenticated)
DROP POLICY IF EXISTS "Allow authenticated users to read page_visits" ON public.page_visits;

-- Create new policy that allows SELECT for both anon and authenticated
CREATE POLICY "Allow anyone to read page_visits"
ON public.page_visits
FOR SELECT
TO anon, authenticated
USING (true);