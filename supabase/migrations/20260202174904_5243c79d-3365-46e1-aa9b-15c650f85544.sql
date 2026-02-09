-- Create RLS policy to allow authenticated users to read page_visits
CREATE POLICY "Allow authenticated users to read page_visits"
ON public.page_visits
FOR SELECT
TO authenticated
USING (true);

-- Create RLS policy to allow anyone to insert page_visits (for tracking)
CREATE POLICY "Allow anyone to insert page_visits"
ON public.page_visits
FOR INSERT
TO anon, authenticated
WITH CHECK (true);