-- M6-2: bank_change_requests の補完
-- before_bank: 申請時点の現在口座スナップショット
ALTER TABLE bank_change_requests
  ADD COLUMN IF NOT EXISTS before_bank JSONB;

-- status 値を制約（既存データは pending のまま）
ALTER TABLE bank_change_requests
  DROP CONSTRAINT IF EXISTS bank_change_requests_status_check;
ALTER TABLE bank_change_requests
  ADD CONSTRAINT bank_change_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

-- RLS 有効化
ALTER TABLE bank_change_requests ENABLE ROW LEVEL SECURITY;

-- パートナー: 自分の申請のみ参照・作成
DROP POLICY IF EXISTS "partner_select_own_bcr" ON bank_change_requests;
CREATE POLICY "partner_select_own_bcr" ON bank_change_requests
  FOR SELECT USING (
    partner_id IN (
      SELECT id FROM partners WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "partner_insert_own_bcr" ON bank_change_requests;
CREATE POLICY "partner_insert_own_bcr" ON bank_change_requests
  FOR INSERT WITH CHECK (
    partner_id IN (
      SELECT id FROM partners WHERE profile_id = auth.uid()
    )
  );

-- オーナー/マネージャー: 全件参照・更新（承認/却下）
DROP POLICY IF EXISTS "admin_all_bcr" ON bank_change_requests;
CREATE POLICY "admin_all_bcr" ON bank_change_requests
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('owner', 'manager')
    )
  );
