-- SYNAPSE Phase 2「掘る」（P2-1）：行動トラッキング用の隔離列（追加のみ）。
-- ★非金銭・本人RLSのみ。お金/deals/frontier/帰属とは無関係。サービス目録は読むだけ（不変）。
--  acted_at : 「紹介文を作る」または「対応済みにする」操作の時刻（nullable）。nudgeのフォローアップ/休眠判定に使用。
-- RLS/GRANT は既存のまま（本人のみ all＋service_role）。列はテーブル権限を継承。
-- 実行：psql 直（DATABASE_URL）。2026-06-22 適用。冪等。
alter table public.synapse_contacts
  add column if not exists acted_at timestamptz;
