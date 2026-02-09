-- ================================================
-- 1. جدول الكوبونات (Coupons)
-- ================================================
CREATE TABLE public.coupons (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    discount_type TEXT NOT NULL DEFAULT 'percentage' CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
    min_order_amount NUMERIC DEFAULT 0,
    max_uses INTEGER DEFAULT NULL,
    used_count INTEGER DEFAULT 0,
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS للكوبونات
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coupons" ON public.coupons
    FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Anyone can view active coupons by code" ON public.coupons
    FOR SELECT USING (is_active = true);

-- ================================================
-- 2. جدول استخدام الكوبونات
-- ================================================
CREATE TABLE public.coupon_uses (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    discount_amount NUMERIC NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coupon uses" ON public.coupon_uses
    FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Users can view own coupon uses" ON public.coupon_uses
    FOR SELECT USING (auth.uid() = user_id);

-- ================================================
-- 3. جدول المفضلة (Wishlist)
-- ================================================
CREATE TABLE public.wishlist_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, product_id)
);

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own wishlist" ON public.wishlist_items
    FOR ALL USING (auth.uid() = user_id);

-- ================================================
-- 4. جدول العروض المحدودة (Flash Sales)
-- ================================================
CREATE TABLE public.flash_sales (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    original_price NUMERIC NOT NULL,
    sale_price NUMERIC NOT NULL CHECK (sale_price < original_price),
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL CHECK (ends_at > starts_at),
    max_quantity INTEGER DEFAULT NULL,
    sold_quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.flash_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage flash sales" ON public.flash_sales
    FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Anyone can view active flash sales" ON public.flash_sales
    FOR SELECT USING (
        is_active = true 
        AND starts_at <= now() 
        AND ends_at > now()
    );

-- ================================================
-- 5. جدول تنبيهات المخزون (Stock Alerts)
-- ================================================
CREATE TABLE public.stock_alerts (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.product_variants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    is_notified BOOLEAN DEFAULT false,
    notified_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    UNIQUE(user_id, product_id, variant_id)
);

ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own stock alerts" ON public.stock_alerts
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all stock alerts" ON public.stock_alerts
    FOR SELECT USING (is_admin(auth.uid()));

-- ================================================
-- 6. إضافة عمود الخصم للطلبات
-- ================================================
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS coupon_id UUID REFERENCES public.coupons(id),
ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;

-- ================================================
-- 7. Trigger لتحديث used_count للكوبون
-- ================================================
CREATE OR REPLACE FUNCTION public.increment_coupon_usage()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE public.coupons 
    SET used_count = used_count + 1 
    WHERE id = NEW.coupon_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_coupon_use_insert
AFTER INSERT ON public.coupon_uses
FOR EACH ROW EXECUTE FUNCTION public.increment_coupon_usage();