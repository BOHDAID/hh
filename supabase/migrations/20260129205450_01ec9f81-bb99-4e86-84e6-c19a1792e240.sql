-- Create page_visits table for analytics
CREATE TABLE public.page_visits (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    ip_hash TEXT NOT NULL,
    country_code TEXT,
    country_name TEXT,
    page_path TEXT NOT NULL DEFAULT '/',
    device_type TEXT DEFAULT 'desktop',
    referrer TEXT,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_page_visits_created_at ON public.page_visits(created_at DESC);
CREATE INDEX idx_page_visits_country ON public.page_visits(country_code);
CREATE INDEX idx_page_visits_page_path ON public.page_visits(page_path);

-- Enable RLS
ALTER TABLE public.page_visits ENABLE ROW LEVEL SECURITY;

-- Only admins can view visits
CREATE POLICY "Admins can view visits"
ON public.page_visits
FOR SELECT
USING (is_admin(auth.uid()));

-- Allow anonymous inserts (for tracking)
CREATE POLICY "Anyone can insert visits"
ON public.page_visits
FOR INSERT
WITH CHECK (true);