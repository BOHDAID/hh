-- جدول إعدادات OTP للمنتجات
CREATE TABLE IF NOT EXISTS public.otp_configurations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    gmail_address TEXT NOT NULL,
    gmail_app_password TEXT NOT NULL,
    activation_type TEXT NOT NULL DEFAULT 'otp' CHECK (activation_type IN ('otp', 'qr')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(product_id) -- منتج واحد = إعداد واحد
);

-- تفعيل RLS
ALTER TABLE public.otp_configurations ENABLE ROW LEVEL SECURITY;

-- سياسة للأدمن فقط
CREATE POLICY "Admins can manage OTP configurations"
ON public.otp_configurations
FOR ALL
USING (public.has_admin_access(auth.uid()))
WITH CHECK (public.has_admin_access(auth.uid()));