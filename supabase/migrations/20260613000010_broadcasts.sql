-- broadcasts: 管理者が作成するお知らせ/お役立ち記事
CREATE TABLE IF NOT EXISTS broadcasts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL CHECK (kind IN ('news','tips')),
  title       TEXT NOT NULL,
  body        TEXT,
  hero_path   TEXT,         -- Supabase Storage のパス（画像）
  body_images JSONB,        -- 本文中の画像パス配列
  segment     TEXT NOT NULL DEFAULT 'all' CHECK (segment IN ('all','individual','corporate')),
  sent_at     TIMESTAMPTZ,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- broadcast_reads: 開封記録
CREATE TABLE IF NOT EXISTS broadcast_reads (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES broadcasts(id) ON DELETE CASCADE,
  partner_id   UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  read_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (broadcast_id, partner_id)
);

-- RLS
ALTER TABLE broadcasts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_reads  ENABLE ROW LEVEL SECURITY;

-- broadcasts: owner は全操作可、partner は sent_at NOT NULL のもの読める
CREATE POLICY "owner_all_broadcasts" ON broadcasts
  FOR ALL TO authenticated
  USING  ((SELECT role FROM profiles WHERE id = auth.uid()) = 'owner')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'owner');

CREATE POLICY "partner_read_broadcasts" ON broadcasts
  FOR SELECT TO authenticated
  USING (sent_at IS NOT NULL);

-- broadcast_reads: partner は自分のレコードだけ操作可
CREATE POLICY "partner_own_reads" ON broadcast_reads
  FOR ALL TO authenticated
  USING (
    partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
  )
  WITH CHECK (
    partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
  );

-- Storage bucket for broadcast hero images
INSERT INTO storage.buckets (id, name, public) VALUES ('broadcasts', 'broadcasts', true) ON CONFLICT DO NOTHING;
