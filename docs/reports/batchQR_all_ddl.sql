-- ============================================================
-- Batch QR 統合DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：ダッシュボードの「月間目標（運営取り分）」を保存する1列を追加。
-- 既存の singleton 設定テーブル notification_settings(id=1) に最小追加。
-- 未実行でも壊れません（目標未設定＝進捗バー非表示・前月比のみ表示／保存は best-effort でスキップ）。
-- ============================================================
alter table public.notification_settings add column if not exists monthly_target bigint;
