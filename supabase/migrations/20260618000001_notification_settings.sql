-- ⑤ 通知設定の永続化（Slack ON/OFF＋各イベント）。単一行のグローバル設定。
-- RLS有効＋ポリシー無し＝service_roleのみアクセス可（APIはservice_role経由）。
create table if not exists notification_settings (
  id smallint primary key default 1,
  slack_enabled        boolean not null default true,
  notify_new_deal      boolean not null default true,
  notify_status_change boolean not null default true,
  notify_payout        boolean not null default true,
  email_enabled        boolean not null default true,
  updated_at           timestamptz not null default now(),
  constraint notification_settings_single check (id = 1)
);

insert into notification_settings (id) values (1) on conflict (id) do nothing;

alter table notification_settings enable row level security;
