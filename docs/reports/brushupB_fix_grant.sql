-- Batch B 修正：meeting_reminders はテーブル作成済みだが service_role に GRANT が無く
-- cron が 42501 permission denied で送信できない。下記1行を Supabase SQL Editor で実行。
-- （service_role は RLS をバイパスするが、テーブル権限の付与は別途必要）
grant all privileges on table public.meeting_reminders to service_role;
