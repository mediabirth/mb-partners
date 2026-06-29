-- perf 第3弾 F：集計の絞り込み高速化索引（読み取りのみ・データ不変・既存索引と非重複）。
-- 既存で十分に索引済み（deal_id/assignment_id/partner_id/fixed_month/status 各単独・delivery系 assignment_id・continuous_payouts）。
-- 唯一の空き＝deals(status, fixed_month) 複合（loadProjectPnl の status IN(confirmed,paid)＋close_month の status+月 に効く）。
CREATE INDEX IF NOT EXISTS deals_status_month_idx ON public.deals (status, fixed_month);
