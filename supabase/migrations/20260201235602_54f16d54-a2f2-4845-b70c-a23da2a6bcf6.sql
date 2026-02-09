-- Create trigger to auto-set reviews with low ratings (< 3 stars) as pending approval
CREATE OR REPLACE FUNCTION public.auto_moderate_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    -- If rating is less than 3 (less than 60%), set as not approved for admin review
    IF NEW.rating < 3 THEN
        NEW.is_approved := false;
    END IF;
    RETURN NEW;
END;
$$;

-- Create trigger on reviews table
DROP TRIGGER IF EXISTS review_auto_moderate ON public.reviews;
CREATE TRIGGER review_auto_moderate
    BEFORE INSERT ON public.reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.auto_moderate_review();