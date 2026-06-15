-- ============================================================
-- T3 Phase3: 不要カラム削除（DROP COLUMN）
-- 実行: 勝彦 が Supabase SQL Editor で実行（CCはDDL不可）
-- 前提: カラム非参照の新コードは既に本番デプロイ済み（c0m3m4bea）
--       → DROP してもアプリは壊れない
-- バックアップ: docs/reports/t3p3_{services,service_menus,deals}_backup.json 取得済
--       （勝彦側でも実行前に下記 0) のスナップショットを推奨）
-- ============================================================

-- 0) 任意: 実行直前スナップショット（Supabase SQL Editor で結果を保存）
-- select * from public.services;
-- select * from public.service_menus;

-- 1) service_menus: ft_*（フロンティア廃止）＋ category（ref_enabled/coop_enabledに移行済）
alter table public.service_menus drop column if exists ft_enabled;
alter table public.service_menus drop column if exists ft_rate;
alter table public.service_menus drop column if exists ft_basis;
alter table public.service_menus drop column if exists ft_trigger;
alter table public.service_menus drop column if exists ft_condition;
alter table public.service_menus drop column if exists example_ft;
alter table public.service_menus drop column if exists category;

-- 2) services: サービス単位 coop_*（協力はメニュー単位 service_menus.coop_* に一本化）
alter table public.services drop column if exists coop_enabled;
alter table public.services drop column if exists coop_rate;
alter table public.services drop column if exists coop_base;

-- ※ services.ft_trigger / services.ft_condition / services.coverage_steps は
--   今回のスコープ外（task指定は services の coop_* のみ）。残置。将来クリーンアップ候補。

-- 3) 検証: 残っていないこと（0行ならOK）
select column_name, table_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'service_menus' and column_name in
      ('ft_enabled','ft_rate','ft_basis','ft_trigger','ft_condition','example_ft','category'))
    or
    (table_name = 'services' and column_name in
      ('coop_enabled','coop_rate','coop_base'))
  );
-- 期待: 0 rows
