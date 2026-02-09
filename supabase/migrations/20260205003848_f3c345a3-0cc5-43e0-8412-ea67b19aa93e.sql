-- Drop existing policies first
DROP POLICY IF EXISTS "Admins can manage coupons" ON public.coupons;
DROP POLICY IF EXISTS "Anyone can view active coupons by code" ON public.coupons;

-- Recreate policies
CREATE POLICY "Admins can manage coupons" ON public.coupons
FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "Anyone can view active coupons by code" ON public.coupons
FOR SELECT USING (is_active = true);