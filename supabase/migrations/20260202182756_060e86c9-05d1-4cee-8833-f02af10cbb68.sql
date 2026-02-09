-- Create product_variants table for sub-products/options within a product
CREATE TABLE public.product_variants (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Anyone can view active variants" 
ON public.product_variants 
FOR SELECT 
USING ((is_active = true) OR is_admin(auth.uid()));

CREATE POLICY "Admins can manage variants" 
ON public.product_variants 
FOR ALL 
USING (is_admin(auth.uid()));

-- Index for faster lookups
CREATE INDEX idx_product_variants_product_id ON public.product_variants(product_id);
CREATE INDEX idx_product_variants_active ON public.product_variants(is_active, product_id);