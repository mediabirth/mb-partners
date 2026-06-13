-- M6: invites テーブルへ name カラムを追加（既存スキーマに対するパッチ）
ALTER TABLE invites ADD COLUMN IF NOT EXISTS name TEXT;
