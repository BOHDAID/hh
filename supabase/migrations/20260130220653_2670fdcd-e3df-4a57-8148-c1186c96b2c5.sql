-- Function to get available stock count for a product (bypasses RLS)
-- This allows all users (including unauthenticated) to see stock counts
CREATE OR REPLACE FUNCTION public.get_product_stock(p_product_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM public.product_accounts
  WHERE product_id = p_product_id
    AND is_sold = false
$$;

-- Grant execute permission to anon and authenticated users
GRANT EXECUTE ON FUNCTION public.get_product_stock(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_product_stock(uuid) TO authenticated;