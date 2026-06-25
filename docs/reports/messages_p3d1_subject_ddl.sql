-- ============================================================================
-- メッセージ Phase 3-D① — テンプレに件名(subject)列を追加（監査用全文）
-- 適用日: 2026-06-25 / 適用: psql 直（Supabase prod）
-- ★既存隔離表 public.message_templates への additive 列のみ。money/deals/帰属 非接触。idempotent。
-- channel/attachments は 3-A で既存。本DDLは email用テンプレの件名保持のみ。
-- ============================================================================

alter table public.message_templates add column if not exists subject text;
