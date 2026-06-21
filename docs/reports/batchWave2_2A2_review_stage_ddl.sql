-- Wave2-②A-2：稟議ステージ（表示専用の追加メタ・additive）。
-- ★status enum・status='confirmed'遷移・お金(reward/frozen/payout/pnl)・④b発火 に一切干渉しない別カラム。
-- 例値 'negotiating'(商談中) / 'review'(稟議中) / null(未設定=従来表示)。既存行は null＝無破壊。
-- 設定は money/confirmed を扱う既存PATCHを通さず、隔離した追加EP(/api/console/deals/[id]/review-stage)で review_stage のみ書く。
-- 実行：psql 直（DATABASE_URL）。2026-06-21 適用済み。冪等。
alter table public.deals add column if not exists review_stage text;
