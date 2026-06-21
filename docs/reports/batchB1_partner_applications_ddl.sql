-- 外向けLP B1：プロ紹介者(士業・コンサル)募集ページ /join の応募保存テーブル（追加のみ）。
-- ★お金・deals・auth・既存RLS には一切関与しない隔離テーブル。アカウント作成もしない。
-- RLS: 有効＋ポリシー0 ＝ 匿名/authenticated は直アクセス不可。書込は service_role(/api/partner-apply)のみ。
-- ★GRANT教訓：psql作成テーブルは service_role への grant が無いと permission denied。明示付与する。
-- 実行：psql 直（DATABASE_URL）。2026-06-22 適用済み。冪等。
create table if not exists public.partner_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  org text,
  expertise text,
  email text,
  phone text,
  message text,
  consent boolean default false,
  source text default 'join_lp',
  user_agent text
);
alter table public.partner_applications enable row level security;
grant all on public.partner_applications to service_role;
