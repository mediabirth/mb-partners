-- ============================================================================
-- メッセージ司令塔 Phase 2 — LINE受信webhook：冪等列＋画像Storage（監査用全文）
-- 適用日: 2026-06-24 / 適用: psql 直（Supabase prod）
-- ★messages 隔離表への additive 列のみ＋private Storageバケット。money/deals/帰属 非接触。idempotent。
-- ============================================================================

-- 冪等性：LINE webhookEventId で重複保存を防止（同一eventの再送を弾く）。
alter table public.messages add column if not exists line_event_id text;
create unique index if not exists messages_line_event_uniq on public.messages (line_event_id) where line_event_id is not null;

-- 画像受信用 private バケット（公開URL発行せず・console表示は署名URL）。service_role のみアクセス。
insert into storage.buckets (id, name, public)
values ('message-attachments', 'message-attachments', false)
on conflict (id) do nothing;
