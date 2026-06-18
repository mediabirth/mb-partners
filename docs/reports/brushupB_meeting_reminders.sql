-- ============================================================
-- Batch B: 商談リマインドの多重送信防止テーブル
-- Supabase SQL Editor で実行してください（CCはDDL不可）。
-- これが存在しない間、/api/cron/reminders は「送信せず」スキップします（fail-closed・スパム防止）。
-- ============================================================
create table if not exists public.meeting_reminders (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid        not null,           -- meetings.id または deals.id
  kind       text        not null,           -- 'prev_day_18' | 'hour_before'
  recipient  text        not null,           -- 'ops' | 'partner' | 'client'
  sent_at    timestamptz not null default now(),
  unique (meeting_id, kind, recipient)
);

-- service_role のみ読み書き（クライアントからは触らない）
alter table public.meeting_reminders enable row level security;
-- 注: service_role は RLS をバイパスするため、明示ポリシーは不要（公開アクセスは付与しない）。

create index if not exists meeting_reminders_meeting_idx on public.meeting_reminders (meeting_id);
