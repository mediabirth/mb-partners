-- ============================================================================
-- 自動メッセージの表示名(label) 列を追加（監査用全文）
-- 適用日: 2026-06-25 / 適用: psql 直（Supabase prod）
-- ★additive 列のみ。money/deals/帰属 非接触。idempotent。
-- ★label は「表示名」専用。category キー（greeting等）は不変＝通知側 resolve の紐づけに影響しない。
-- ============================================================================

alter table public.message_templates add column if not exists label text;
