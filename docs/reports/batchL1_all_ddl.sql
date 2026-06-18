-- ============================================================
-- 案件明細化 Batch L1（基盤）DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：deal_items（1案件＝複数サービス明細）の器を作る。今回は「持つだけ・使わない」。
-- 未実行でも壊れません（作成パスの明細書込は best-effort で no-op）。
-- アクセスは service_role のみ（Phase 1 は完全に内部/不可視。Phase 2 で表示時にread方針を追加）。
-- ============================================================
create table if not exists public.deal_items (
  id          uuid        primary key default gen_random_uuid(),
  deal_id     uuid        not null references public.deals(id) on delete cascade,
  service_id  text,
  menu_id     uuid,
  kind        text        not null default 'fixed',   -- 'fixed' | 'rate'
  amount      bigint      not null default 0,          -- この明細の報酬額
  base_amount bigint,                                  -- 率明細のベース（任意）
  sort        int         not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.deal_items enable row level security;
grant all privileges on table public.deal_items to service_role;
create index if not exists deal_items_deal_idx on public.deal_items(deal_id);
