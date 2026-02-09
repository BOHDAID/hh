-- Add warranty_days column to product_variants table
ALTER TABLE public.product_variants 
ADD COLUMN warranty_days integer DEFAULT 0;