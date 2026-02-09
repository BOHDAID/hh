-- Create store-assets bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-assets', 'store-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to store-assets
CREATE POLICY "Public can view store assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-assets');

-- Allow admins to upload store assets
CREATE POLICY "Admins can upload store assets"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'store-assets' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Allow admins to update store assets
CREATE POLICY "Admins can update store assets"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'store-assets' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Allow admins to delete store assets
CREATE POLICY "Admins can delete store assets"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'store-assets' 
  AND EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);