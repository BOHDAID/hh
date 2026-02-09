-- إصلاح تحذيرات الأمان: تعيين search_path للدوال

-- إصلاح دالة توليد رقم الطلب
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.order_number := 'ORD-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || SUBSTRING(NEW.id::TEXT, 1, 8);
    RETURN NEW;
END;
$$;

-- إصلاح دالة تحديث متوسط التقييم
CREATE OR REPLACE FUNCTION public.update_product_rating()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- تحديث سياسة طلبات المنتجات لتكون أكثر أماناً
DROP POLICY IF EXISTS "Anyone can create requests" ON public.product_requests;
CREATE POLICY "Authenticated users can create requests" ON public.product_requests
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR auth.uid() = user_id);

-- تحديث سياسة التقييمات
DROP POLICY IF EXISTS "Users can create reviews" ON public.reviews;
CREATE POLICY "Authenticated users can create reviews" ON public.reviews
    FOR INSERT WITH CHECK (
        (auth.uid() IS NOT NULL AND auth.uid() = user_id) 
        OR public.is_admin(auth.uid())
    );