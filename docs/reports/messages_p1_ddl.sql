-- ============================================================================
-- メッセージ司令塔 Phase 1 — public.messages 隔離表 DDL（監査用全文）
-- 適用日: 2026-06-24 / 適用: psql 直（Supabase prod）
-- ★隔離表：deals/money/reward/payout/pnl/帰属 に FK を一切張らない（参照値のみ）。
--   money 計算・既存 RLS・既存 notify 経路には非接触。idempotent（IF NOT EXISTS）。
-- ============================================================================

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  partner_id  uuid,                                   -- 参照のみ・FK無し（money/帰属計算に使わない）
  customer_email text,                                -- 顧客宛（partner_id が null のとき）
  direction   text not null check (direction in ('in','out')),
  channel     text not null check (channel in ('line','email')),
  subject     text,                                   -- メール件名
  body        text,
  attachments jsonb,                                  -- [{filename, path|url, ...}]（Storage パス等）
  status      text,                                   -- sent | failed | skipped 等
  error       text,
  sent_by     uuid,                                   -- 送信した owner（参照のみ・FK無し）
  thread_key  text not null                           -- 'partner:<uuid>' / 'email:<addr>' 導出キー
);

-- RLS 有効化＋ポリシー0（authenticated/anon は直アクセス不可）。service_role は RLS バイパス。
alter table public.messages enable row level security;
grant all on table public.messages to service_role;

-- index：スレッド時系列・パートナー別・新着順。
create index if not exists messages_thread_idx  on public.messages (thread_key, created_at);
create index if not exists messages_partner_idx on public.messages (partner_id);
create index if not exists messages_created_idx on public.messages (created_at desc);
