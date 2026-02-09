-- Create product_types table for custom product types
CREATE TABLE public.product_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;

-- Admins can manage product types
CREATE POLICY "Admins can manage product types" 
ON public.product_types 
FOR ALL 
USING (is_admin(auth.uid()));

-- Anyone can view product types
CREATE POLICY "Anyone can view product types" 
ON public.product_types 
FOR SELECT 
USING (true);

-- Insert default product types
INSERT INTO public.product_types (name, display_order) VALUES
  ('حساب', 1),
  ('خدمة', 2),
  ('حزمة', 3),
  ('كود', 4),
  ('اشتراك', 5),
  ('بطاقة', 6),
  ('رصيد', 7);