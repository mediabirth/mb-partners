-- GEN-2: 表示・共有ファネルの参照元とメニューを記録する additive 列。
-- 起票の帰属は従来どおり referral token が正であり、この表は計測専用。
alter table public.funnel_events
  add column if not exists src text null,
  add column if not exists menu_id uuid null;
