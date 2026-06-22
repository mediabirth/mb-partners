-- SYNAPSE 作り直し（R4）：カードに“読み（次の一手）”を載せるための隔離列を追加（追加のみ）。
-- ★非金銭・本人RLSのみ。お金/deals/frontier/帰属とは無関係。service_menus等のサービス目録は読むだけ（不変）。
--  suggested_service : SYNAPSEが読んだ適合MBサービス名（services.name の文字列・nullable）。
--  suggested_angle   : 刺さる切り口（angle・nullable）。
-- RLS/GRANT は既存のまま（本人のみ all＋service_role）。列はテーブル権限を継承。
-- 実行：psql 直（DATABASE_URL）。2026-06-22 適用。冪等。
alter table public.synapse_contacts
  add column if not exists suggested_service text,
  add column if not exists suggested_angle text;
