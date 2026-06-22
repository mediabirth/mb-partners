-- SYNAPSE 需要分析モデル：事実フィールド＋需要分析の隔離列（追加のみ）。
-- ★非金銭・本人RLSのみ。お金/deals/frontier/帰属とは無関係。サービス目録・紹介履歴は読むだけ（不変）。
--  entity_type    : 個人/法人（'individual' | 'corporate'・nullable）。一覧の個人/法人タブ用。
--  phone / address: 事実フィールド（scanは空欄のみ自動記入。既存値は上書きしない）。
--  demand_summary : 需要分析の文章（read-onlyな知能。出しっぱなしで参照可）。
--  demand_tags    : 需要カテゴリの配列（jsonb・3〜5個）。
-- RLS/GRANT は既存のまま（本人のみ all＋service_role）。列はテーブル権限を継承。
-- 実行：psql 直（DATABASE_URL）。2026-06-23 適用。冪等。
alter table public.synapse_contacts
  add column if not exists entity_type text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists demand_summary text,
  add column if not exists demand_tags jsonb;
