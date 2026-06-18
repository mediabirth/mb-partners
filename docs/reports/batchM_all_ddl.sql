-- ============================================================
-- Batch M 統合DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：MB中心アカウントでの商談予定作成＋Google Meetリンク保存に必要な列を追加。
-- これらが無くても商談設定/予約は壊れません（meeting_url の保存のみ best-effort でスキップ）。
-- ※ mb_calendar テーブルは既存（id=1）。下記 create は冪等な保険＋GRANT付与のため。
-- ============================================================

-- ① 商談に Google Meet 会議URLを保存
alter table public.deals    add column if not exists meeting_url text;
alter table public.meetings add column if not exists meeting_url text;

-- ② MB中心カレンダー（既存。保険として if not exists ＋ service_role GRANT）
create table if not exists public.mb_calendar (
  id             int  primary key,
  google_email   text,
  oauth_tokens   jsonb,
  active         boolean    not null default false,
  business_start text       not null default '09:00',
  business_end   text       not null default '18:00',
  no_weekend     boolean    not null default true,
  no_holiday     boolean    not null default true,
  slot_minutes   int        not null default 30,
  buffer_minutes int        not null default 0,
  updated_at     timestamptz not null default now()
);
alter table public.mb_calendar enable row level security;  -- service_role のみ
grant all privileges on table public.mb_calendar to service_role;
insert into public.mb_calendar (id) values (1) on conflict (id) do nothing;
