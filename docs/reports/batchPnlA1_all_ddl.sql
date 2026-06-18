-- ============================================================
-- MBプロジェクトP&L A-1 DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：受注額(revenue)・MB担当(director_id)・その他原価(other_cost) を追加。
-- パートナー報酬/凍結/payout/override は無改修。MB粗利は読取専用集計（既存保存値は上書きしない）。
-- 冪等：add column if not exists。enum変更なし。新規テーブルなし（grant不要）。
-- ============================================================

-- ① 明細(サービス)ごとの受注額（売上・税抜）。固定明細は売上未知のため null 可。
alter table public.deal_items add column if not exists revenue bigint;

-- ② MB担当（フロントディレクター）＝内部メンバー（profiles.id）。案件単位・null可。
alter table public.deals add column if not exists director_id uuid;

-- ③ その他原価（案件単位）。
alter table public.deals add column if not exists other_cost bigint not null default 0;
