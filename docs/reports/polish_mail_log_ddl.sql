-- 磨きプログラム①: メール送信履歴（additive only）。運営がいつ・誰に・どのテンプレが送られたかを掌握する。
create table if not exists public.mail_log (
  id          bigint generated always as identity primary key,
  template_key text,                 -- レジストリのキー（手動送信等はnull可）
  event       text,                  -- 発火イベント（deal_won / referral_receipt / ...）
  to_email    text not null,
  to_role     text,                  -- partner / customer / ops / vendor / invitee
  subject     text not null,
  status      text not null,         -- sent / skipped / error
  detail      text,                  -- skipped理由 / エラーメッセージ
  meta        jsonb,                 -- deal_id等の参照
  created_at  timestamptz not null default now()
);
create index if not exists mail_log_created_idx on public.mail_log (created_at desc);
create index if not exists mail_log_template_idx on public.mail_log (template_key);
alter table public.mail_log enable row level security;
-- service_roleのみ（コンソールAPIはservice role経由で閲覧）
grant select, insert on public.mail_log to service_role;
grant usage on all sequences in schema public to service_role;
