-- Create function to get variant stock count (safe for all users)
CREATE OR REPLACE FUNCTION public.get_variant_stock(p_product_id uuid, p_variant_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.product_accounts
  WHERE product_id = p_product_id
    AND (
      (p_variant_id IS NULL AND variant_id IS NULL)
      OR (p_variant_id IS NOT NULL AND variant_id = p_variant_id)
    )
    AND is_sold = false
$$;