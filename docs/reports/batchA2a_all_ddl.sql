-- ============================================================
-- MBプロジェクトP&L A-2a DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：業務委託先(deliveries)＋デリバリー割当(delivery_assignments)。委託費はP&Lに読取で加算。
-- パートナー報酬/凍結/payout/override/billing は無改修。委託費は粗利計算に足すだけ。
-- アクセスは service_role のみ（コンソールは service_role 経由）。partner/vendor read は今回付与しない（Phase Cで追加）。
-- 冪等：create table if not exists / add ... if not exists。新規テーブルは service_role への GRANT 必須。
-- ============================================================

-- ① 業務委託先マスタ
create table if not exists public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null,
  kind          text,                            -- 例: カメラマン / エンジニア / その他
  contact_email text,
  note          text,
  active        boolean     not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.deliveries enable row level security;
grant all privileges on table public.deliveries to service_role;

-- ② デリバリー割当（明細単位＝deal_item_id／案件単位＝deal_item_id null も許容）
create table if not exists public.delivery_assignments (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid        not null references public.deals(id) on delete cascade,
  deal_item_id uuid        references public.deal_items(id) on delete cascade,  -- null=案件単位
  delivery_id  uuid        references public.deliveries(id),
  base_fee     bigint      not null default 0,    -- 委託費
  status       text        not null default 'assigned',
  assigned_by  uuid,
  assigned_at  timestamptz not null default now(),
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
alter table public.delivery_assignments enable row level security;
grant all privileges on table public.delivery_assignments to service_role;
create index if not exists delivery_assignments_deal_idx on public.delivery_assignments(deal_id);
create index if not exists delivery_assignments_item_idx on public.delivery_assignments(deal_item_id);
