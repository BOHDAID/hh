-- Allow admins to insert wallets for users
CREATE POLICY "Admins can insert wallets"
ON public.wallets
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

-- Allow admins to insert wallet transactions
CREATE POLICY "Admins can insert wallet transactions"
ON public.wallet_transactions
FOR INSERT
WITH CHECK (is_admin(auth.uid()));