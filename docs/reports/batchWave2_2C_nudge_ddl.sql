-- Wave2-②C：ナッジ（再活性化）記録（additive）。お金・status・confirmed・reward には一切非接触。
-- partners は既存テーブル＝service_role GRANT 済（列は継承）。新テーブルは作らず additive 列で対応。
-- last_nudged_at＝同一partnerへの頻度上限(既定14日)判定＋最終ナッジ日表示に使用。既存行は null。
-- 実行：psql 直（DATABASE_URL）。2026-06-21 適用済み。冪等。
alter table public.partners add column if not exists last_nudged_at timestamptz;
