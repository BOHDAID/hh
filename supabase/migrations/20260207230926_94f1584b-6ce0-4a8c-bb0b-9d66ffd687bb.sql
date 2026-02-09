-- Add English name column to categories
ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS name_en text;

-- Add English name and description columns to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS description_en text;

-- Add English name and description columns to product_variants
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS name_en text;
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS description_en text;