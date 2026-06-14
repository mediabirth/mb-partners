-- Create service-logos bucket (public)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'service-logos',
  'service-logos',
  true,
  5242880, -- 5MB
  ARRAY['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Public read policy
CREATE POLICY "service_logos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'service-logos');

-- Authenticated users (admins) can upload
CREATE POLICY "service_logos_auth_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'service-logos' AND auth.role() = 'authenticated');

-- Authenticated users can update / delete their uploads
CREATE POLICY "service_logos_auth_update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'service-logos' AND auth.role() = 'authenticated');

CREATE POLICY "service_logos_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'service-logos' AND auth.role() = 'authenticated');
