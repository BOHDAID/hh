
-- جدول جلسات الكوكيز المتعددة
CREATE TABLE public.osn_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  email TEXT,
  cookies JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_connected BOOLEAN DEFAULT false,
  last_activity TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- تفعيل RLS
ALTER TABLE public.osn_sessions ENABLE ROW LEVEL SECURITY;

-- سياسة الأدمن فقط
CREATE POLICY "Admins can manage OSN sessions"
ON public.osn_sessions
FOR ALL
USING (is_admin(auth.uid()));
