-- SYNAPSE 仕上げ（⑥）：需要分析タグ2段化＝推奨サービス列（追加のみ・隔離）。
-- ★非金銭・本人RLSのみ。サービス目録/紹介履歴 read-only。お金/deals/帰属とは無関係。
--  recommended_services : 需要分析の「推奨サービス」タグ。サービス目録(services.name)に完全一致する実在名のみを格納（捏造ガード）。jsonb配列。
-- RLS/GRANT は既存のまま（本人のみ all＋service_role）。列はテーブル権限を継承。
-- 実行：psql 直（DATABASE_URL）。2026-06-23 適用。冪等。
alter table public.synapse_contacts
  add column if not exists recommended_services jsonb;
