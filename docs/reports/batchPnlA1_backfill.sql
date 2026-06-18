-- ============================================================
-- MBプロジェクトP&L A-1 バックフィル — batchPnlA1_all_ddl.sql 実行後に流す。
-- 率明細(kind=rate)は revenue=base_amount をコピー（売上ベース既知）。
-- 固定明細(kind=fixed)は revenue=null のまま（顧客受注額が未知＝後から入力）。
-- 冪等：revenue 未設定のみ更新。reward/deals.amount/凍結/payout は一切変更しない。
-- ============================================================

update public.deal_items
set revenue = base_amount, updated_at = now()
where kind = 'rate' and base_amount is not null and revenue is null;

-- 検証クエリ（実行後に確認）：
--   率明細で revenue=base_amount になっているか（不一致＝0であるべき）：
--     select count(*) from deal_items where kind='rate' and base_amount is not null and (revenue is distinct from base_amount);
--   固定明細は revenue=null のまま（=fixedの件数と一致／受注額は後から入力）：
--     select kind, count(*) c, count(revenue) with_rev from deal_items group by kind;
