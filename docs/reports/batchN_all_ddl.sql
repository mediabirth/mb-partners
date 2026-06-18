-- ============================================================
-- Batch N 統合DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：不成立（失注）ハンドリング。deal_status に 'lost' を追加し、失注理由/メモ/日時を保存。
-- これらが無くても既存フローは壊れません（不成立化のみ enum エラーで失敗・other transitions 影響なし）。
--
-- ※ ALTER TYPE ... ADD VALUE はトランザクション制約があるため、
--   下の「STEP 1」を実行してコミットしてから「STEP 2」を実行してください
--   （SQL Editor で全選択→Run で問題が出る場合は、STEP 1 と STEP 2 を別々に Run）。
-- ============================================================

-- STEP 1: enum に 'lost' を追加（成約に至らなかった終了状態）
ALTER TYPE deal_status ADD VALUE IF NOT EXISTS 'lost';

-- ── ここで一度コミット（別 Run）──────────────────────────────

-- STEP 2: 失注メタデータ列
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS lost_at     timestamptz;
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS lost_reason text;   -- 予算/タイミング/競合/連絡途絶/ニーズ不一致/お客様都合/その他
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS lost_note   text;   -- 任意の自由メモ
