
-- Add fulfillment_type to product_variants
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS fulfillment_type text NOT NULL DEFAULT 'normal';

-- Add on_demand_message site setting
INSERT INTO public.site_settings (key, value, category, is_sensitive, description)
VALUES ('on_demand_message', 'تواصل معنا لتفعيل المنتج الخاص بك', 'general', false, 'الرسالة التي تظهر للعميل عند شراء منتج يحتاج تفعيل يدوي')
ON CONFLICT (key) DO NOTHING;
