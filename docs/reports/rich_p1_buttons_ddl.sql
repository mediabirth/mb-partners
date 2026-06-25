-- ============================================================================
-- リッチ Phase 1 — テンプレに URLボタン(buttons)列を追加（監査用全文）
-- 適用日: 2026-06-25 / 適用: psql 直（Supabase prod）
-- ★既存隔離表 public.message_templates への additive 列のみ。money/deals/帰属 非接触。idempotent。
-- buttons jsonb = [{label text, url text}]（最大3・アプリ層でバリデート）。既存行は null＝従来動作。
-- ============================================================================

alter table public.message_templates add column if not exists buttons jsonb;
