
-- Create storage bucket for store assets
INSERT INTO storage.buckets (id, name, public) VALUES ('store-assets', 'store-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload store assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'store-assets' AND auth.uid() IS NOT NULL);

-- Allow public read access
CREATE POLICY "Public read access for store assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'store-assets');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update store assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'store-assets' AND auth.uid() IS NOT NULL);

-- Allow authenticated users to delete their uploads
CREATE POLICY "Authenticated users can delete store assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'store-assets' AND auth.uid() IS NOT NULL);
