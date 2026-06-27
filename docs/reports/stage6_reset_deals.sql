-- ============================================================================
-- 段階6-2a：全 deals 完全初期化（★勝彦 案3 承認済・不可逆）。baseline 04419d4 / 2026-06-28
-- 消す＝deals 一式（CASCADE: deal_items/deal_events/delivery_assignments/delivery_payout_items、
--        meetings は SET NULL で残存）＋ 孤立 deal_tasks（FK制約なし）。
-- ★消さない：payout_batches/payout_items（支払い履歴・金額snapshot・deal_id持たず＝不変）、
--            menus/service_menus/services（マスタ）、close_month_batch/lib計算ロジック。
-- 直前件数：deals 34（confirmed13/in_progress7/received6/paid6/lost2）、deal_items35、deal_tasks13、delivery_payout_items3。
-- ============================================================================
BEGIN;
DELETE FROM public.deals;                                   -- 全34件＋CASCADE連動
DELETE FROM public.deal_tasks WHERE deal_id NOT IN (SELECT id FROM public.deals);  -- 孤立タスク（deals空＝全削除）
COMMIT;
-- ROLLBACK不可（不可逆・承認済の完全初期化）。コード/スキーマのみ tag で戻せる。
