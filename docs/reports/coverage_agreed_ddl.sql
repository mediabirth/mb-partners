-- ③ 対応範囲の項目別同意の証跡（揉め防止）。additive のみ。
-- deals に coverage_agreed jsonb を追加（同意した対応範囲ラベル＋同意時刻 {labels:[], at:ISO}）。
-- 既存行は null。consent/partner_id/money列/status は一切変更しない。
-- 2026-06-27
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS coverage_agreed jsonb;
