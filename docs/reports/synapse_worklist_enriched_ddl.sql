-- SYNAPSE 仕事リスト化（T1）：読みの自動付与の“処理済みマーク”列（追加のみ・隔離）。
-- ★非金銭・本人RLSのみ。お金/deals/frontier/帰属とは無関係。サービス目録・紹介履歴は読むだけ（不変）。
--  enriched_at : 読みの自動付与を実行した時刻（nullable）。
--    「未読み」＝ needs is not null AND suggested_service is null AND enriched_at is null。
--    無適合(no-fit)でも enriched_at を立てて再処理しない＝“一度きり”キャッシュ。
-- RLS/GRANT は既存のまま（本人のみ all＋service_role）。列はテーブル権限を継承。
-- 実行：psql 直（DATABASE_URL）。2026-06-22 適用。冪等。
alter table public.synapse_contacts
  add column if not exists enriched_at timestamptz;
