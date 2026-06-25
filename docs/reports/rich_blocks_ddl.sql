-- ============================================================================
-- リッチ再設計 — テンプレに blocks(ブロック配列) 列を追加（監査用全文）
-- 適用日: 2026-06-25 / 適用: psql 直（Supabase prod）
-- ★既存隔離表 public.message_templates への additive 列のみ。money/deals/帰属 非接触。idempotent。
-- blocks jsonb = 順序保持の配列 [{type:'text',text}, {type:'image',path,url?}, {type:'button',label,url}]
-- ★既存列（body/attachments/buttons/channel/subject）は残す＝後方互換。blocks null の旧テンプレは旧フィールドで従来通り送信。
-- ============================================================================

alter table public.message_templates add column if not exists blocks jsonb;
