-- service_menus: add category / coverage_steps / qualification
ALTER TABLE service_menus
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'referral';

ALTER TABLE service_menus
  ADD COLUMN IF NOT EXISTS coverage_steps JSONB;

ALTER TABLE service_menus
  ADD COLUMN IF NOT EXISTS qualification TEXT;

-- Tighten service-logos INSERT: admin only (profile.role != 'partner')
DROP POLICY IF EXISTS "service_logos_auth_insert" ON storage.objects;

CREATE POLICY "service_logos_admin_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'service-logos'
    AND auth.role() = 'authenticated'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role != 'partner'
    )
  );
