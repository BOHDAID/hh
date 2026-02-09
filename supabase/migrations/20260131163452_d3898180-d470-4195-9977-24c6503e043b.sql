-- Fix page_visits: Replace overly permissive INSERT policy
-- Allow inserts but validate required fields
DROP POLICY IF EXISTS "Anyone can insert visits" ON public.page_visits;
CREATE POLICY "Anyone can insert visits with validation"
ON public.page_visits
FOR INSERT
WITH CHECK (
  -- Ensure ip_hash is provided and not empty
  ip_hash IS NOT NULL AND 
  length(ip_hash) > 0 AND
  -- Ensure page_path is valid
  page_path IS NOT NULL
);

-- Fix contact_messages: Replace overly permissive INSERT policy
-- Validate email format and required fields
DROP POLICY IF EXISTS "Anyone can create contact messages" ON public.contact_messages;
CREATE POLICY "Anyone can create contact messages with validation"
ON public.contact_messages
FOR INSERT
WITH CHECK (
  -- Ensure required fields are provided
  name IS NOT NULL AND 
  length(name) >= 2 AND
  length(name) <= 100 AND
  email IS NOT NULL AND
  email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' AND
  message IS NOT NULL AND
  length(message) >= 10 AND
  length(message) <= 5000
);