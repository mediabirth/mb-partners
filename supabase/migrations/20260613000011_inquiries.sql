-- inquiries: 問い合わせスレッド
CREATE TABLE IF NOT EXISTS inquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('reward','deal','account','other')),
  subject     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','replied','closed')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- inquiry_messages: スレッド内メッセージ
CREATE TABLE IF NOT EXISTS inquiry_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id   UUID NOT NULL REFERENCES inquiries(id) ON DELETE CASCADE,
  sender_role  TEXT NOT NULL CHECK (sender_role IN ('partner','owner')),
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  created_by   UUID REFERENCES auth.users(id)
);

-- RLS
ALTER TABLE inquiries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inquiry_messages  ENABLE ROW LEVEL SECURITY;

-- inquiries: partner は自分のもの、owner は全件
CREATE POLICY "partner_own_inquiries" ON inquiries
  FOR ALL TO authenticated
  USING (
    partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
  )
  WITH CHECK (
    partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
    OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
  );

-- inquiry_messages: inquiry の閲覧権があれば参照可
CREATE POLICY "inquiry_messages_access" ON inquiry_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM inquiries i
      WHERE i.id = inquiry_id
        AND (
          i.partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM inquiries i
      WHERE i.id = inquiry_id
        AND (
          i.partner_id = (SELECT id FROM partners WHERE profile_id = auth.uid())
          OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'owner'
        )
    )
  );
