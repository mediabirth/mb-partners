-- ============================================================================
-- LINE Login 認証（1タップログイン）— single-use state 用 nonce 表（監査用全文）
-- 適用日: 2026-06-26 / 適用: psql 直（Supabase prod）
-- ★新規 additive 表。money/deals/帰属/既存認証 非接触。
-- ★既存 line_oauth_nonces は partner_id NOT NULL（連携専用・ログイン開始時は partner 未確定）のため流用不可→専用表。
-- RLS 有効＋ポリシー0（service_role のみ・既存 line_oauth_nonces と同方針）。redirect は /app 配下のみ start で検証済を保持。
-- ============================================================================

create table if not exists public.line_login_nonces (
  nonce       text primary key,
  redirect    text,                                   -- 復帰先（/app 配下のみ・start で検証済）
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

alter table public.line_login_nonces enable row level security;
grant all on public.line_login_nonces to service_role;
create index if not exists line_login_nonces_exp_idx on public.line_login_nonces (expires_at);
