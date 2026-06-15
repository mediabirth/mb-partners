-- ② 率報酬の根拠：実額(売上/粗利/利益/受取収入)を保持する base_amount を deals に追加
-- 加算的・非破壊（nullable）。固定額(紹介)案件は NULL のまま。
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC;
