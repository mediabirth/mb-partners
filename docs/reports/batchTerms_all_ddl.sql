-- ============================================================
-- 登録時の利用規約同意 DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：同意した規約バージョンを記録する列を partners に追加。
-- 既存の terms_agreed_at は既存・本DDLでは触らない。
-- 未実行でも登録は壊れません（terms_version の保存は best-effort でスキップ／terms_agreed_at は従来どおり記録）。
-- 冪等：add column if not exists。enum変更なし。新規テーブルなし（grant不要）。
-- ============================================================
alter table public.partners add column if not exists terms_version text;
