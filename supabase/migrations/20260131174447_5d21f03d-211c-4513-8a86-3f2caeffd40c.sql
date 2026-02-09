-- ============================================================
-- Security Improvement: get_product_stock returns range instead of exact count
-- ============================================================

-- First drop the existing function (different return type)
DROP FUNCTION IF EXISTS public.get_product_stock(uuid);

-- Create new function returning stock level as text
CREATE OR REPLACE FUNCTION public.get_product_stock(p_product_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    CASE 
      WHEN COUNT(*) = 0 THEN 'out_of_stock'
      WHEN COUNT(*) BETWEEN 1 AND 5 THEN 'low_stock'
      WHEN COUNT(*) BETWEEN 6 AND 20 THEN 'in_stock'
      ELSE 'high_stock'
    END
  FROM public.product_accounts
  WHERE product_id = p_product_id
    AND is_sold = false
$$;

-- Keep execute permissions for displaying stock status
GRANT EXECUTE ON FUNCTION public.get_product_stock(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_product_stock(uuid) TO authenticated;

-- Add a separate admin-only function for exact counts
CREATE OR REPLACE FUNCTION public.get_product_stock_exact(p_product_id uuid)
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

-- Only authenticated users can call (admin check done in caller)
GRANT EXECUTE ON FUNCTION public.get_product_stock_exact(uuid) TO authenticated;