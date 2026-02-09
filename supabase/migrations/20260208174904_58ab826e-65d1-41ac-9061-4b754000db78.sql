-- جدول أكواد التفعيل للمنتجات المحمية
CREATE TABLE public.activation_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    order_item_id uuid REFERENCES public.order_items(id) ON DELETE CASCADE,
    product_id uuid REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
    user_id uuid NOT NULL,
    -- بيانات الحساب
    account_email text,
    account_password text,
    -- حالة الكود
    status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'used', 'expired')),
    is_used boolean DEFAULT false,
    used_at timestamp with time zone,
    -- بيانات تيليجرام
    telegram_chat_id text,
    telegram_username text,
    -- انتهاء الصلاحية
    expires_at timestamp with time zone DEFAULT (now() + interval '24 hours'),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

-- جدول رموز OTP
CREATE TABLE public.otp_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    activation_code_id uuid REFERENCES public.activation_codes(id) ON DELETE CASCADE NOT NULL,
    otp_code text NOT NULL,
    source text DEFAULT 'email', -- email, qr, manual
    is_delivered boolean DEFAULT false,
    delivered_at timestamp with time zone,
    expires_at timestamp with time zone DEFAULT (now() + interval '5 minutes'),
    created_at timestamp with time zone DEFAULT now()
);

-- جدول إعدادات البوت (يمكن إضافتها في site_settings)
-- سنستخدم site_settings الموجود

-- إضافة عمود للمنتجات لتحديد إذا كان يحتاج تفعيل
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS requires_activation boolean DEFAULT false;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS activation_type text DEFAULT 'otp' CHECK (activation_type IN ('otp', 'qr', 'both'));

-- Enable RLS
ALTER TABLE public.activation_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY;

-- سياسات الأمان لـ activation_codes
CREATE POLICY "Admins can manage activation codes"
ON public.activation_codes FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Users can view own activation codes"
ON public.activation_codes FOR SELECT
USING (auth.uid() = user_id OR is_admin(auth.uid()));

-- سياسات الأمان لـ otp_codes
CREATE POLICY "Admins can manage otp codes"
ON public.otp_codes FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Users can view own otp codes via activation"
ON public.otp_codes FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.activation_codes ac
        WHERE ac.id = otp_codes.activation_code_id
        AND ac.user_id = auth.uid()
    )
    OR is_admin(auth.uid())
);

-- فهارس للأداء
CREATE INDEX idx_activation_codes_code ON public.activation_codes(code);
CREATE INDEX idx_activation_codes_user ON public.activation_codes(user_id);
CREATE INDEX idx_activation_codes_status ON public.activation_codes(status);
CREATE INDEX idx_activation_codes_product ON public.activation_codes(product_id);
CREATE INDEX idx_otp_codes_activation ON public.otp_codes(activation_code_id);

-- دالة لتوليد كود تفعيل فريد
CREATE OR REPLACE FUNCTION public.generate_activation_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_code text;
    code_exists boolean;
BEGIN
    LOOP
        -- توليد كود من 8 أحرف وأرقام
        new_code := UPPER(SUBSTRING(MD5(gen_random_uuid()::text), 1, 8));
        
        -- التحقق من عدم وجود الكود
        SELECT EXISTS(SELECT 1 FROM activation_codes WHERE code = new_code) INTO code_exists;
        
        IF NOT code_exists THEN
            RETURN new_code;
        END IF;
    END LOOP;
END;
$$;