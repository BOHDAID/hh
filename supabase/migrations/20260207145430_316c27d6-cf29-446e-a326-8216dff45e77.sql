
CREATE OR REPLACE FUNCTION public.get_variant_stock(p_product_id uuid, p_variant_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT 
    CASE 
      -- If variant is unlimited, always return high stock number
      WHEN p_variant_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.product_variants 
        WHERE id = p_variant_id AND is_unlimited = true
      ) THEN 999999
      -- Normal stock count for non-unlimited variants
      ELSE (
        SELECT COUNT(*)::integer
        FROM public.product_accounts
        WHERE product_id = p_product_id
          AND (
            (p_variant_id IS NULL AND variant_id IS NULL)
            OR (p_variant_id IS NOT NULL AND variant_id = p_variant_id)
          )
          AND is_sold = false
      )
    END
$function$;
