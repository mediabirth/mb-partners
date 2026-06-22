-- SYNAPSE 名簿化（N3）：会社URL取込（SYNAPSEボタン）用の隔離列（追加のみ）。
-- ★非金銭・本人RLSのみ。お金/deals/frontier/帰属とは無関係。サービス目録・紹介履歴は読むだけ（不変）。
--  url          : 会社サイトURL（SYNAPSEが取得・抽出する対象）。
--  company_size : 規模（従業員数/売上感など、抽出 or 手入力）。
--  scanned_at   : URL取込を実行した時刻（nullable）。
-- RLS/GRANT は既存のまま（本人のみ all＋service_role）。列はテーブル権限を継承。
-- 実行：psql 直（DATABASE_URL）。2026-06-22 適用。冪等。
alter table public.synapse_contacts
  add column if not exists url text,
  add column if not exists company_size text,
  add column if not exists scanned_at timestamptz;
