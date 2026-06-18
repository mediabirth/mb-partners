-- ============================================================
-- V-1 デリバリー プロジェクト管理 基盤 DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：ベンダーを「経費/報酬中心」→「プロジェクト管理＋お金（結果）」へ。実行メタデータのみ＝お金ロジックから独立。
-- 構造（概要/タスク/マイルストーン/成果物/進捗）はMB（コンソール）が管理。vendor の SELECT/書込 RLS は V-2 で付与。
-- 不変：reward/frozen/payout/payout_overrides/delivery_payout_items/close_month_batch/frontier/billing/lib/pnl は無改修。
-- type/kind/status は text + CHECK（enum不使用＝ADD VALUE別Run不要）。新規テーブルは service_role へ GRANT。
-- バケットは expense-evidence と同方式の private（サーバ経由保存＋署名URL）。冪等。
-- ============================================================

-- ① プロジェクト概要/スコープ（MBが delivery 向けに共有。受注額/粗利等の商流情報は含めない運用）
alter table public.deals
  add column if not exists delivery_brief text;

-- ② delivery_tasks（実行構造＝公式タスク/マイルストーン・MBが作成）
create table if not exists public.delivery_tasks (
  id                     uuid        primary key default gen_random_uuid(),
  delivery_assignment_id uuid        not null references public.delivery_assignments(id) on delete cascade,
  title                  text        not null,
  type                   text        not null default 'task'    check (type in ('task','milestone')),
  needs_deliverable      boolean     not null default false,    -- 必要成果物フラグ
  due_date               date,
  sort                   integer     not null default 0,
  status                 text        not null default 'pending' check (status in ('pending','done')),  -- V-2でvendorが更新
  done_at                timestamptz,
  done_by                uuid        references public.profiles(id),
  created_by             uuid        references public.profiles(id),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
alter table public.delivery_tasks enable row level security;
grant all privileges on table public.delivery_tasks to service_role;
create index if not exists delivery_tasks_assignment_idx on public.delivery_tasks(delivery_assignment_id);

-- ③ delivery_deliverables（成果物・private bucket。V-2でvendorアップロード、MB閲覧）
create table if not exists public.delivery_deliverables (
  id                     uuid        primary key default gen_random_uuid(),
  delivery_assignment_id uuid        not null references public.delivery_assignments(id) on delete cascade,
  task_id                uuid        references public.delivery_tasks(id) on delete set null,
  file_path              text        not null,   -- delivery-files バケット内パス
  file_name              text,
  uploaded_by            uuid        references public.profiles(id),
  note                   text,
  created_at             timestamptz not null default now()
);
alter table public.delivery_deliverables enable row level security;
grant all privileges on table public.delivery_deliverables to service_role;
create index if not exists delivery_deliverables_assignment_idx on public.delivery_deliverables(delivery_assignment_id);

-- ④ delivery_updates（進捗メモ/課題フラグ。V-2でvendor投稿、MBが閲覧/フラグresolve）
create table if not exists public.delivery_updates (
  id                     uuid        primary key default gen_random_uuid(),
  delivery_assignment_id uuid        not null references public.delivery_assignments(id) on delete cascade,
  kind                   text        not null default 'note' check (kind in ('note','flag')),
  body                   text        not null,
  status                 text        check (status in ('open','resolved')),  -- flag用（note は null）
  created_by             uuid        references public.profiles(id),
  created_at             timestamptz not null default now(),
  resolved_at            timestamptz,
  resolved_by            uuid        references public.profiles(id)
);
alter table public.delivery_updates enable row level security;
grant all privileges on table public.delivery_updates to service_role;
create index if not exists delivery_updates_assignment_idx on public.delivery_updates(delivery_assignment_id);

-- ⑤ 成果物の private バケット（クライアント直アップロードはしない＝V-2でサーバ経由保存＋署名URL）
insert into storage.buckets (id, name, public)
values ('delivery-files', 'delivery-files', false)
on conflict (id) do nothing;

-- ⑥ storage.objects ポリシー：service_role 全アクセス（コンソールは service_role 経由）。
--    ※ service_role は RLS をバイパスするが明示付与（冪等）。vendor の storage アクセスは V-2 で付与。
drop policy if exists "delivery_files_service_all" on storage.objects;
create policy "delivery_files_service_all" on storage.objects
  for all to service_role
  using      (bucket_id = 'delivery-files')
  with check (bucket_id = 'delivery-files');
