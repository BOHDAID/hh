-- Add per-user usage limit and product type restriction to coupons
ALTER TABLE public.coupons 
ADD COLUMN max_uses_per_user integer DEFAULT NULL,
ADD COLUMN product_type_id uuid REFERENCES public.product_types(id) ON DELETE SET NULL;

-- Add index for product type lookups
CREATE INDEX idx_coupons_product_type ON public.coupons(product_type_id) WHERE product_type_id IS NOT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.coupons.max_uses_per_user IS 'Maximum times a single user can use this coupon (NULL = unlimited)';
COMMENT ON COLUMN public.coupons.product_type_id IS 'If set, coupon only applies to products of this type';