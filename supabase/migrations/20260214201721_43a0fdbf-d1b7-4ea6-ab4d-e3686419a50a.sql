
-- Drop the auth-required policies and replace with public upload policies
DROP POLICY IF EXISTS "Auth upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload store assets" ON storage.objects;

-- Allow any upload to product-images (access controlled by admin UI)
CREATE POLICY "Allow upload product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images');

-- Allow any upload to store-assets
CREATE POLICY "Allow upload store assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'store-assets');
