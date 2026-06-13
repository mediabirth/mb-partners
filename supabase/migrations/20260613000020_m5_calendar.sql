-- M5: Google Calendar 連携
-- calendar_links と meetings に不足カラムを追加

-- ── calendar_links ────────────────────────────────────────────────────────────
-- partner_id: パートナーとの紐付け（元スキーマでは owner_name のみで FK なし）
ALTER TABLE calendar_links
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES partners(id) ON DELETE CASCADE;

-- availability: 受付時間帯設定 JSONB
-- 例: {"days":[1,2,3,4,5],"start":"10:00","end":"18:00","slot_minutes":60}
ALTER TABLE calendar_links
  ADD COLUMN IF NOT EXISTS availability JSONB;

-- ── meetings ──────────────────────────────────────────────────────────────────
-- 予約者情報（クライアント）
ALTER TABLE meetings
  ADD COLUMN IF NOT EXISTS client_name  TEXT,
  ADD COLUMN IF NOT EXISTS client_email TEXT,
  ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ DEFAULT now();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- calendar_links: パートナーは自分のレコードだけ読み書き可
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'calendar_links' AND policyname = 'partner_own_calendar_links'
  ) THEN
    CREATE POLICY "partner_own_calendar_links" ON calendar_links
      FOR ALL TO authenticated
      USING (
        partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
      )
      WITH CHECK (
        partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
      );
  END IF;
END $$;

-- meetings: パートナーは自分の meetings のみ参照可（予約はパブリック経由で service_role 使用）
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'meetings' AND policyname = 'partner_own_meetings'
  ) THEN
    CREATE POLICY "partner_own_meetings" ON meetings
      FOR ALL TO authenticated
      USING (
        partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
      )
      WITH CHECK (
        partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
        OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
      );
  END IF;
END $$;
