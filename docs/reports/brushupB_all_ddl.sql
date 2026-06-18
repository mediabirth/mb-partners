-- ============================================================
-- Batch B / B-2 統合DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- これらが無い間：
--   - /api/cron/reminders は送信せずスキップ（fail-closed・スパム防止）
--   - deals.customer_email への保存/参照は no-op（顧客メールは従来通りスキップ）
-- いずれもアプリ側は best-effort のため、未実行でも既存機能は壊れません。
-- ============================================================

-- ① 商談リマインドの多重送信防止（Batch B）
create table if not exists public.meeting_reminders (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid        not null,           -- meetings.id または deals.id
  kind       text        not null,           -- 'prev_day_18' | 'hour_before'
  recipient  text        not null,           -- 'ops' | 'partner' | 'client'
  sent_at    timestamptz not null default now(),
  unique (meeting_id, kind, recipient)
);
alter table public.meeting_reminders enable row level security;  -- service_role のみ（公開アクセス無し）
create index if not exists meeting_reminders_meeting_idx on public.meeting_reminders (meeting_id);
-- service_role は RLS をバイパスするが、テーブル権限(GRANT)は別途必要。
-- これが無いと cron(service_role) が 42501 permission denied で送信できない。
grant all privileges on table public.meeting_reminders to service_role;

-- ② deal（パートナー設定の商談）に顧客メール列を追加（Batch B-2）
alter table public.deals add column if not exists customer_email text;
