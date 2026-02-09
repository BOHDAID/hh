-- Fix email_logs RLS policy to use has_admin_access function
DROP POLICY IF EXISTS "Admins can view email logs" ON public.email_logs;

CREATE POLICY "Admins can view email logs" 
ON public.email_logs 
FOR SELECT 
USING (has_admin_access(auth.uid()));

-- Fix payments RLS policy to use has_admin_access for admin access
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;

CREATE POLICY "Admins can manage all payments" 
ON public.payments 
FOR ALL
USING (has_admin_access(auth.uid()));
