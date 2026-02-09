-- Add rate limiting table for security
CREATE TABLE IF NOT EXISTS public.rate_limits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address text NOT NULL,
    endpoint text NOT NULL,
    request_count integer DEFAULT 1,
    window_start timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint ON public.rate_limits(ip_address, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON public.rate_limits(window_start);

-- Enable RLS
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service role can access rate limits
CREATE POLICY "Only service role can manage rate limits"
ON public.rate_limits
FOR ALL
USING (false)
WITH CHECK (false);

-- Function to check rate limit (returns true if allowed)
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_ip_address text,
    p_endpoint text,
    p_max_requests integer DEFAULT 10,
    p_window_minutes integer DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_count integer;
    window_start_time timestamp with time zone;
BEGIN
    window_start_time := now() - (p_window_minutes || ' minutes')::interval;
    
    -- Clean old records
    DELETE FROM rate_limits 
    WHERE window_start < window_start_time;
    
    -- Get current count
    SELECT COALESCE(SUM(request_count), 0) INTO current_count
    FROM rate_limits
    WHERE ip_address = p_ip_address 
    AND endpoint = p_endpoint
    AND window_start > window_start_time;
    
    -- Check if limit exceeded
    IF current_count >= p_max_requests THEN
        RETURN false;
    END IF;
    
    -- Insert or update count
    INSERT INTO rate_limits (ip_address, endpoint, request_count, window_start)
    VALUES (p_ip_address, p_endpoint, 1, now())
    ON CONFLICT (id) DO NOTHING;
    
    RETURN true;
END;
$$;

-- Add validation for contact messages (basic spam protection)
CREATE OR REPLACE FUNCTION public.validate_contact_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Basic validation
    IF length(NEW.name) < 2 THEN
        RAISE EXCEPTION 'Name too short';
    END IF;
    
    IF length(NEW.message) < 10 THEN
        RAISE EXCEPTION 'Message too short';
    END IF;
    
    IF NEW.email !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RAISE EXCEPTION 'Invalid email format';
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger for validation
DROP TRIGGER IF EXISTS validate_contact_message_trigger ON contact_messages;
CREATE TRIGGER validate_contact_message_trigger
    BEFORE INSERT ON contact_messages
    FOR EACH ROW
    EXECUTE FUNCTION validate_contact_message();