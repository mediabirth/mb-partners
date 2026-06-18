-- ============================================================
-- MBプロジェクトP&L Phase B DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：デリバリー（業務委託先）への支払管理を「完全に別ストリーム」で記録する。
--       支払額 = 委託費(base_fee) + Σ承認済経費(expense_total)。帰属月＝案件の成約月。
-- パートナー支払（payout_items / payout_overrides / close_month_batch / frontier-payout / lib/payout / billing）
--       とは別テーブル＝一切共有しない・改修しない。MB粗利(lib/pnl)も不変（原価は既に計上済・二重計上しない）。
-- 「支払確定（凍結）」時点の base_fee/承認済経費をスナップショット記録（パートナー凍結と同思想）。
-- 冪等：create table if not exists / add ... if not exists。新規テーブルは service_role への GRANT 必須。
-- ============================================================

-- ① デリバリー支払明細（凍結スナップショット・パートナーpayoutとは独立）
create table if not exists public.delivery_payout_items (
  id            uuid        primary key default gen_random_uuid(),
  delivery_id   uuid        not null references public.deliveries(id) on delete cascade,
  deal_id       uuid        not null references public.deals(id)       on delete cascade,
  deal_item_id  uuid        references public.deal_items(id)           on delete set null,  -- null=案件単位
  base_fee      bigint      not null default 0,    -- 委託費（凍結時点）
  expense_total bigint      not null default 0,    -- 承認済経費合計（凍結時点）
  amount        bigint      not null default 0,    -- = base_fee + expense_total（凍結時点）
  period        text        not null,              -- 帰属月 YYYY-MM（案件の成約月）
  status        text        not null default 'unpaid',  -- unpaid / paid
  frozen_at     timestamptz not null default now(),
  paid_at       timestamptz,
  paid_by       uuid        references public.profiles(id),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.delivery_payout_items enable row level security;
grant all privileges on table public.delivery_payout_items to service_role;
create index if not exists delivery_payout_items_delivery_idx on public.delivery_payout_items(delivery_id);
create index if not exists delivery_payout_items_period_idx   on public.delivery_payout_items(period);
create index if not exists delivery_payout_items_status_idx   on public.delivery_payout_items(status);
-- 同一(案件×明細×委託先×月)の二重凍結を防ぐ（deal_item_id null は別物として扱われるため
-- 案件単位は coalesce で一意化）。
create unique index if not exists delivery_payout_items_uniq
  on public.delivery_payout_items(delivery_id, deal_id, coalesce(deal_item_id, '00000000-0000-0000-0000-000000000000'::uuid), period);
