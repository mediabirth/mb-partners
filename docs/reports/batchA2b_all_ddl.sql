-- ============================================================
-- MBプロジェクトP&L A-2b DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：経費申請(expense_claims)＋エビデンス添付(expense-evidence private bucket)＋承認。
--       承認済(approved)経費を P&L に読取で加算。MB粗利 = 受注額 − 報酬 − override − その他原価 − (Σ委託費＋Σ承認済経費)。
-- パートナー報酬/凍結/payout/override/billing は無改修。経費は粗利計算に足すだけ（保存値非書込）。
-- アクセスは service_role のみ（コンソールは service_role 経由・サーバでアップロード/署名URL発行）。
--       partner/vendor の storage アクセスは Phase C で付与。
-- 冪等：create table if not exists / on conflict do nothing / drop policy if exists → create。
-- 新規テーブルは service_role への GRANT 必須。
-- ============================================================

-- ① 経費申請（割当＝delivery_assignments 単位・cascade）
create table if not exists public.expense_claims (
  id                     uuid        primary key default gen_random_uuid(),
  delivery_assignment_id uuid        not null references public.delivery_assignments(id) on delete cascade,
  kind                   text        not null default 'その他',   -- 交通 / 宿泊 / その他
  amount                 bigint      not null default 0,
  evidence_path          text,                                    -- expense-evidence バケット内パス（null可）
  status                 text        not null default 'submitted', -- submitted / approved / rejected
  submitted_by           uuid,                                    -- 今回はコンソール入力=MB（null可）
  submitted_at           timestamptz not null default now(),
  approved_by            uuid        references public.profiles(id),
  approved_at            timestamptz,
  note                   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
alter table public.expense_claims enable row level security;
grant all privileges on table public.expense_claims to service_role;
create index if not exists expense_claims_assignment_idx on public.expense_claims(delivery_assignment_id);
create index if not exists expense_claims_status_idx     on public.expense_claims(status);

-- ② 非公開バケット（領収書・エビデンス）。クライアント直アップロードはせず、サーバ(service_role)経由で保存。
insert into storage.buckets (id, name, public)
values ('expense-evidence', 'expense-evidence', false)
on conflict (id) do nothing;

-- ③ storage.objects ポリシー：service_role 全アクセス（コンソールは service_role 経由）。
--    ※ service_role は RLS をバイパスするが、明示ポリシーとして付与（冪等）。partner/vendor は Phase C。
drop policy if exists "expense_evidence_service_all" on storage.objects;
create policy "expense_evidence_service_all" on storage.objects
  for all to service_role
  using      (bucket_id = 'expense-evidence')
  with check (bucket_id = 'expense-evidence');
