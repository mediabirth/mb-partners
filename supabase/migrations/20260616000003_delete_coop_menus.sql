-- ⚠ 確認必須: cooperation カテゴリのメニュー行を削除する
-- 実行前に migration 002 (fold) が適用済みであること。
-- バックアップテーブル作成後に DELETE する。

-- Step 1: バックアップテーブル作成（べき等）
CREATE TABLE IF NOT EXISTS service_menus_coop_backup AS
  SELECT * FROM service_menus WHERE category = 'cooperation';

-- Step 2: cooperation カテゴリ行を削除
DELETE FROM service_menus WHERE category = 'cooperation';
