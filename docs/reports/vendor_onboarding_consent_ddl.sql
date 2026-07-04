-- 案件: デリバリー全面進化＋PWA招待動線プログラム（2026-07-05）
-- ベンダー登録フォームを partner 同等（住所・電話・税区分・振込先・インボイス・規約同意）へ引き上げるにあたり、
-- 規約/プライバシー同意の記録先を deliveries に additive で追加する（partner の partners.terms_agreed_at と対称）。
-- additive のみ・NULL 許容・既存行/money/RLS 非接触。
alter table public.deliveries add column if not exists terms_agreed_at   timestamptz;
alter table public.deliveries add column if not exists privacy_agreed_at timestamptz;

-- 監査: 追加後の列確認
-- select column_name, data_type, is_nullable from information_schema.columns
--   where table_name='deliveries' and column_name in ('terms_agreed_at','privacy_agreed_at');
