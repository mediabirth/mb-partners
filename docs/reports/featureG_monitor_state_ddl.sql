-- Feature G: 自己監視（synthetic monitoring）の状態保持。
-- ★追加型・冪等のみ。money・既存テーブル非接触。監視の連続失敗カウント／発報状態のみ。
create table if not exists public.monitor_state (
  check_key   text primary key,
  fail_streak int not null default 0,
  alerting    boolean not null default false,
  last_ok     timestamptz,
  last_error  text,
  updated_at  timestamptz not null default now()
);
alter table public.monitor_state enable row level security;
grant all on public.monitor_state to service_role;
