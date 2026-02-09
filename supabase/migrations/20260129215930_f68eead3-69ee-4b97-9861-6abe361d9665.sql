-- Create cart_items table for shopping cart
CREATE TABLE public.cart_items (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, product_id)
);

-- Enable RLS
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- Users can view their own cart items
CREATE POLICY "Users can view own cart items"
ON public.cart_items
FOR SELECT
USING (auth.uid() = user_id);

-- Users can add to their own cart
CREATE POLICY "Users can add to own cart"
ON public.cart_items
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own cart items
CREATE POLICY "Users can update own cart items"
ON public.cart_items
FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete from their own cart
CREATE POLICY "Users can delete from own cart"
ON public.cart_items
FOR DELETE
USING (auth.uid() = user_id);

-- Admins can manage all cart items
CREATE POLICY "Admins can manage all cart items"
ON public.cart_items
FOR ALL
USING (is_admin(auth.uid()));