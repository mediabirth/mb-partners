-- ============================================================
-- 案件明細化 Batch L3（相談案件）DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：サービス未定で起票できる「相談案件」。service_id を nullable 化し is_consultation を追加。
-- 既存案件・金額・確定挙動は不変（service_id を持つ案件は従来どおり）。
-- ※未実行の間は「相談として起票」は NOT NULL 制約でエラーになります（通常の起票・既存機能は影響なし）。
-- 冪等：drop not null / add column if not exists とも再実行安全。enum 変更なし。新規テーブルなし（grant不要）。
-- ============================================================

-- ① service_id を nullable に（相談案件＝サービス未定で起票）
alter table public.deals alter column service_id drop not null;

-- ② 相談案件マーカー（面談後にサービスを割り当てても履歴として残す）
alter table public.deals add column if not exists is_consultation boolean not null default false;
