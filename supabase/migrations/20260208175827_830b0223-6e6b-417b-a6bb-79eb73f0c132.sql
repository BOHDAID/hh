-- إضافة Foreign Keys المفقودة لجدول activation_codes
ALTER TABLE public.activation_codes
DROP CONSTRAINT IF EXISTS activation_codes_product_id_fkey,
DROP CONSTRAINT IF EXISTS activation_codes_order_id_fkey,
DROP CONSTRAINT IF EXISTS activation_codes_order_item_id_fkey,
DROP CONSTRAINT IF EXISTS activation_codes_user_id_fkey;

ALTER TABLE public.activation_codes
ADD CONSTRAINT activation_codes_product_id_fkey 
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
ADD CONSTRAINT activation_codes_order_id_fkey 
  FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL,
ADD CONSTRAINT activation_codes_order_item_id_fkey 
  FOREIGN KEY (order_item_id) REFERENCES public.order_items(id) ON DELETE SET NULL;

-- إضافة Foreign Key لجدول otp_codes
ALTER TABLE public.otp_codes
DROP CONSTRAINT IF EXISTS otp_codes_activation_code_id_fkey;

ALTER TABLE public.otp_codes
ADD CONSTRAINT otp_codes_activation_code_id_fkey 
  FOREIGN KEY (activation_code_id) REFERENCES public.activation_codes(id) ON DELETE CASCADE;

-- تحديث سياسات RLS لتكون PERMISSIVE بدلاً من RESTRICTIVE
DROP POLICY IF EXISTS "Admins can manage activation codes" ON public.activation_codes;
DROP POLICY IF EXISTS "Users can view own activation codes" ON public.activation_codes;

CREATE POLICY "Admins can manage activation codes" 
ON public.activation_codes 
FOR ALL 
USING (is_admin(auth.uid()));

CREATE POLICY "Users can view own activation codes" 
ON public.activation_codes 
FOR SELECT 
USING ((auth.uid() = user_id) OR is_admin(auth.uid()));

-- تحديث سياسات otp_codes
DROP POLICY IF EXISTS "Admins can manage otp codes" ON public.otp_codes;
DROP POLICY IF EXISTS "Users can view own otp codes via activation" ON public.otp_codes;

CREATE POLICY "Admins can manage otp codes" 
ON public.otp_codes 
FOR ALL 
USING (is_admin(auth.uid()));

CREATE POLICY "Users can view own otp codes via activation" 
ON public.otp_codes 
FOR SELECT 
USING (
  (EXISTS (
    SELECT 1 FROM activation_codes ac
    WHERE ac.id = otp_codes.activation_code_id 
    AND ac.user_id = auth.uid()
  )) 
  OR is_admin(auth.uid())
);

-- إضافة index للأداء
CREATE INDEX IF NOT EXISTS idx_activation_codes_user_id ON public.activation_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_activation_codes_product_id ON public.activation_codes(product_id);
CREATE INDEX IF NOT EXISTS idx_activation_codes_status ON public.activation_codes(status);
CREATE INDEX IF NOT EXISTS idx_activation_codes_code ON public.activation_codes(code);
CREATE INDEX IF NOT EXISTS idx_otp_codes_activation_code_id ON public.otp_codes(activation_code_id);