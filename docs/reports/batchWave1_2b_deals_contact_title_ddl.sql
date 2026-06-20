-- Wave1-②b：法人紹介のB2B構造化情報「部署・役職」を deals に additive 追加。
-- customer_type / company_name / contact_name は既存（保存済み）。今回追加は contact_title のみ。
--
-- 性質：冪等・nullable・additive。既存カラム/制約/お金カラム/保存ロジックは一切変更しない。
-- 既存行は contact_title = null（無破壊）。法人かつ入力時のみ保存（actions.ts は best-effort update）。
-- 実行：psql 直（DATABASE_URL）。2026-06-21 適用済み。
alter table public.deals add column if not exists contact_title text;
