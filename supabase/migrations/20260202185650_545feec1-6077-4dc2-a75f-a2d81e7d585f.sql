-- Add variant_id column to product_accounts if not exists
ALTER TABLE public.product_accounts 
ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

-- Add is_unlimited column to product_variants for unlimited stock products
ALTER TABLE public.product_variants 
ADD COLUMN IF NOT EXISTS is_unlimited BOOLEAN DEFAULT false;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_product_accounts_variant_id ON public.product_accounts(variant_id);