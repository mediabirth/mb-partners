-- GEN-1「鼓動」: consoleの段階解禁スイッチ。既定OFFで本番配信は勝彦の操作まで発火しない。
alter table public.notification_settings
  add column if not exists weekly_digest_enabled boolean not null default false;
