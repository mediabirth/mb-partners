-- ============================================================
-- F-1 概念・ステータス基盤 DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：「2つの入口がプロジェクトで合流する」背骨。intake_type（流入経路）＋ project_status（プロジェクト実行ステータス）。
--       phase は intake_type＋成約状態＋project_status から導出（アプリ純関数・DB列なし）。
-- ★絶対不変：project_status は実行管理メタデータ。reward/frozen/payout/close_month_batch/lib/pnl には一切影響しない（独立）。
--   「成約(受注確定)→報酬計算/凍結」のトリガー・挙動は本DDLで変更しない（既存 status/channel/amount は無改修）。
-- text + check（enum不使用＝ADD VALUE別Run不要）。新規テーブルなし・grant不要（deals は既存）。1Run・冪等。
-- ============================================================

-- ① 流入経路（referral_coop＝紹介・協力／direct＝直営業）。既定 referral_coop。
alter table public.deals
  add column if not exists intake_type text not null default 'referral_coop'
    check (intake_type in ('referral_coop', 'direct'));

-- ② プロジェクト実行ステータス（商談語彙とは別。null=まだ商談段階）。
alter table public.deals
  add column if not exists project_status text
    check (project_status in ('未着手', '進行中', '確認待ち', '修正対応', '納品完了', '保留'));

-- ③ バックフィル：成約(プロジェクト化)済（confirmed/paid）→ '未着手'。商談中(received/in_progress)/不成立(lost) は null のまま。
--    ※ intake_type は既存全行 default の referral_coop（明確な直営業は後で MB が再分類）。
update public.deals
  set project_status = '未着手'
  where status in ('confirmed', 'paid') and project_status is null;
