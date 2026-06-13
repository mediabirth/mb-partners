-- M6: invites テーブル（招待制アカウント作成）

CREATE TABLE IF NOT EXISTS invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'partner' CHECK (role IN ('partner', 'owner')),
  name        TEXT,
  token       UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at     TIMESTAMPTZ,
  invited_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'invites' AND policyname = 'owner_manage_invites'
  ) THEN
    CREATE POLICY "owner_manage_invites" ON invites
      FOR ALL TO authenticated
      USING  ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager'))
      WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) IN ('owner', 'manager'));
  END IF;
END $$;
