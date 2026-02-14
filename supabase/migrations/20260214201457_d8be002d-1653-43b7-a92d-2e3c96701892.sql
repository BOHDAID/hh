
-- Ensure product-images bucket exists
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to product-images
CREATE POLICY "Auth upload product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);

-- Allow public read for product-images
CREATE POLICY "Public read product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- Allow authenticated users to update product images
CREATE POLICY "Auth update product images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to delete product images
CREATE POLICY "Auth delete product images"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images' AND auth.uid() IS NOT NULL);
