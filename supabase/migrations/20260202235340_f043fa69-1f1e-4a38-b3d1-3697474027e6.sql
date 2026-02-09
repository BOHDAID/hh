-- Create table for multiple variant images
CREATE TABLE public.product_variant_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_variant_images ENABLE ROW LEVEL SECURITY;

-- Admins can manage variant images
CREATE POLICY "Admins can manage variant images"
ON public.product_variant_images
FOR ALL
USING (is_admin(auth.uid()));

-- Anyone can view variant images
CREATE POLICY "Anyone can view variant images"
ON public.product_variant_images
FOR SELECT
USING (true);

-- Create index for faster queries
CREATE INDEX idx_variant_images_variant_id ON public.product_variant_images(variant_id);