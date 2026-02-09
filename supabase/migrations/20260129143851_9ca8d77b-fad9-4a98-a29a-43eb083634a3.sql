-- =============================================
-- المرحلة 1: توسيع قاعدة البيانات الشاملة
-- =============================================

-- 1. جدول إعدادات الموقع
CREATE TABLE public.site_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    category TEXT DEFAULT 'general',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- إدخال الإعدادات الافتراضية
INSERT INTO public.site_settings (key, value, category) VALUES
    ('store_name', 'إمبراطورية المنتجات الرقمية', 'branding'),
    ('store_logo_url', NULL, 'branding'),
    ('instagram_url', NULL, 'social'),
    ('tiktok_url', NULL, 'social'),
    ('telegram_url', NULL, 'social'),
    ('telegram_channel', NULL, 'social'),
    ('crypto_wallet_address', NULL, 'payment'),
    ('affiliate_commission', '10', 'payment');

-- 2. جدول المحافظ
CREATE TABLE public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    balance DECIMAL(10,2) DEFAULT 0,
    total_earned DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id)
);

-- 3. جدول معاملات المحفظة
CREATE TABLE public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('deposit', 'purchase', 'refund', 'affiliate_commission')),
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    reference_id UUID,
    status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 4. جدول المسوقين بالعمولة
CREATE TABLE public.affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referral_code TEXT UNIQUE NOT NULL,
    total_referrals INTEGER DEFAULT 0,
    total_earnings DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id)
);

-- 5. جدول تتبع الإحالات
CREATE TABLE public.referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES public.affiliates(id) ON DELETE CASCADE,
    referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'registered' CHECK (status IN ('registered', 'purchased')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(referred_user_id)
);

-- 6. جدول الطلبات
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    total_amount DECIMAL(10,2) NOT NULL,
    payment_method TEXT CHECK (payment_method IN ('wallet', 'stripe', 'crypto', 'manual')),
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
    warranty_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 7. جدول عناصر الطلب
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    product_account_id UUID REFERENCES public.product_accounts(id),
    quantity INTEGER DEFAULT 1,
    price DECIMAL(10,2) NOT NULL,
    delivered_data TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 8. جدول التقييمات
CREATE TABLE public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    reviewer_name TEXT NOT NULL,
    is_fake BOOLEAN DEFAULT false,
    is_approved BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 9. جدول طلبات المنتجات
CREATE TABLE public.product_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'fulfilled', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 10. جدول عناصر الحزم
CREATE TABLE public.bundle_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bundle_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(bundle_id, product_id)
);

-- =============================================
-- تعديل الجداول الموجودة
-- =============================================

-- تعديل جدول المنتجات
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'account' CHECK (product_type IN ('account', 'service', 'bundle')),
ADD COLUMN IF NOT EXISTS warranty_days INTEGER DEFAULT 7,
ADD COLUMN IF NOT EXISTS platform TEXT,
ADD COLUMN IF NOT EXISTS sales_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS average_rating DECIMAL(2,1) DEFAULT 0;

-- تعديل جدول الملفات الشخصية
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.affiliates(id) ON DELETE SET NULL;

-- =============================================
-- تمكين RLS على الجداول الجديدة
-- =============================================

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bundle_items ENABLE ROW LEVEL SECURITY;

-- =============================================
-- سياسات الأمان (RLS Policies)
-- =============================================

-- site_settings: الجميع يقرأ، الأدمن يعدل
CREATE POLICY "Anyone can view site settings" ON public.site_settings
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage site settings" ON public.site_settings
    FOR ALL USING (public.is_admin(auth.uid()));

-- wallets: المستخدم يرى محفظته، الأدمن يرى الكل
CREATE POLICY "Users can view own wallet" ON public.wallets
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage wallets" ON public.wallets
    FOR ALL USING (public.is_admin(auth.uid()));

-- wallet_transactions: المستخدم يرى معاملاته
CREATE POLICY "Users can view own transactions" ON public.wallet_transactions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.wallets 
            WHERE wallets.id = wallet_transactions.wallet_id 
            AND wallets.user_id = auth.uid()
        ) OR public.is_admin(auth.uid())
    );

CREATE POLICY "Admins can manage transactions" ON public.wallet_transactions
    FOR ALL USING (public.is_admin(auth.uid()));

-- affiliates: المستخدم يرى بياناته
CREATE POLICY "Users can view own affiliate data" ON public.affiliates
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage affiliates" ON public.affiliates
    FOR ALL USING (public.is_admin(auth.uid()));

-- referrals
CREATE POLICY "Users can view referrals" ON public.referrals
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.affiliates 
            WHERE affiliates.id = referrals.referrer_id 
            AND affiliates.user_id = auth.uid()
        ) OR public.is_admin(auth.uid())
    );

CREATE POLICY "Admins can manage referrals" ON public.referrals
    FOR ALL USING (public.is_admin(auth.uid()));

-- orders: المستخدم يرى طلباته
CREATE POLICY "Users can view own orders" ON public.orders
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Users can create orders" ON public.orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can manage orders" ON public.orders
    FOR ALL USING (public.is_admin(auth.uid()));

-- order_items
CREATE POLICY "Users can view own order items" ON public.order_items
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.orders 
            WHERE orders.id = order_items.order_id 
            AND orders.user_id = auth.uid()
        ) OR public.is_admin(auth.uid())
    );

CREATE POLICY "Admins can manage order items" ON public.order_items
    FOR ALL USING (public.is_admin(auth.uid()));

-- reviews: الجميع يقرأ المعتمدة
CREATE POLICY "Anyone can view approved reviews" ON public.reviews
    FOR SELECT USING (is_approved = true OR public.is_admin(auth.uid()));

CREATE POLICY "Users can create reviews" ON public.reviews
    FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can manage reviews" ON public.reviews
    FOR ALL USING (public.is_admin(auth.uid()));

-- product_requests
CREATE POLICY "Users can view own requests" ON public.product_requests
    FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Anyone can create requests" ON public.product_requests
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Admins can manage requests" ON public.product_requests
    FOR ALL USING (public.is_admin(auth.uid()));

-- bundle_items: الجميع يقرأ
CREATE POLICY "Anyone can view bundle items" ON public.bundle_items
    FOR SELECT USING (true);

CREATE POLICY "Admins can manage bundle items" ON public.bundle_items
    FOR ALL USING (public.is_admin(auth.uid()));

-- =============================================
-- Storage Buckets
-- =============================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('store-assets', 'store-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies
CREATE POLICY "Anyone can view product images" ON storage.objects
    FOR SELECT USING (bucket_id = 'product-images');

CREATE POLICY "Admins can upload product images" ON storage.objects
    FOR INSERT WITH CHECK (bucket_id = 'product-images' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can update product images" ON storage.objects
    FOR UPDATE USING (bucket_id = 'product-images' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete product images" ON storage.objects
    FOR DELETE USING (bucket_id = 'product-images' AND public.is_admin(auth.uid()));

CREATE POLICY "Anyone can view store assets" ON storage.objects
    FOR SELECT USING (bucket_id = 'store-assets');

CREATE POLICY "Admins can manage store assets" ON storage.objects
    FOR ALL USING (bucket_id = 'store-assets' AND public.is_admin(auth.uid()));

-- =============================================
-- دالة توليد رقم الطلب
-- =============================================

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.generate_order_number();

-- =============================================
-- تحديث trigger لإنشاء محفظة وكود إحالة للمستخدم الجديد
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_count INTEGER;
    referral_code_val TEXT;
BEGIN
    -- Count existing users
    SELECT COUNT(*) INTO user_count FROM public.user_roles;
    
    -- Create profile
    INSERT INTO public.profiles (user_id, email, full_name)
    VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
    
    -- First user becomes admin, others are regular users
    IF user_count = 0 THEN
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.id, 'admin');
    ELSE
        INSERT INTO public.user_roles (user_id, role)
        VALUES (NEW.id, 'user');
        
        -- Create wallet for non-admin users
        INSERT INTO public.wallets (user_id, balance)
        VALUES (NEW.id, 0);
        
        -- Generate unique referral code
        referral_code_val := UPPER(SUBSTRING(MD5(NEW.id::TEXT || NOW()::TEXT), 1, 8));
        
        -- Create affiliate record
        INSERT INTO public.affiliates (user_id, referral_code)
        VALUES (NEW.id, referral_code_val);
    END IF;
    
    RETURN NEW;
END;
$$;

-- =============================================
-- دالة تحديث متوسط التقييم
-- =============================================

CREATE OR REPLACE FUNCTION public.update_product_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.products
    SET average_rating = (
        SELECT COALESCE(AVG(rating)::DECIMAL(2,1), 0)
        FROM public.reviews
        WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
        AND is_approved = true
    )
    WHERE id = COALESCE(NEW.product_id, OLD.product_id);
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rating_on_review
    AFTER INSERT OR UPDATE OR DELETE ON public.reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.update_product_rating();