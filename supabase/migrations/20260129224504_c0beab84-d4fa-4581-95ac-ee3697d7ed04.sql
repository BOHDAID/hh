-- إضافة الأدوار الجديدة
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'full_access';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';

-- إضافة index للبحث السريع برقم الطلب
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);