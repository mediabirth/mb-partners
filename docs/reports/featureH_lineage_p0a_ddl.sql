-- Feature H (P0-a): 系統連動レート — サプライヤー識別＋条件凍結＋請求凍結（設計正典: docs/design/lineage-rate-design.md v2）
-- ★追加型・冪等のみ（ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT EXISTS）。
-- ★既存money（reward_snapshot/amount/payout_*/menu_rewardsの既存行/computeOverrides）には一切触れない。

-- 1) サプライヤー識別: services→会社フロンティア(partners)の結線（null=MB自社ブランド）
alter table public.services
  add column if not exists supplier_partner_id uuid references public.partners(id);

-- 2) サプライヤーの料率カード（null='std-v1'。オムニス='omnis-founding-v1'。標準移行はこの値の切替＝凍結済みは不変）
alter table public.partners
  add column if not exists supplier_rate_card text;

-- 3) 条件の凍結（第1段・金額は入れない＝2段凍結）
alter table public.deals
  add column if not exists fee_snapshot jsonb;

-- 4) 金額の凍結（第2段・月次請求クローズ）: delivery_payout_items の状態機械を踏襲
create table if not exists public.supplier_charges (
  id                  uuid primary key default gen_random_uuid(),
  supplier_partner_id uuid not null references public.partners(id),
  deal_id             uuid references public.deals(id) on delete set null,  -- 取消に耐える（snapshotが自己完結）
  kind                text not null check (kind in ('half_commission','payment_fee_5','omnis_monthly')),
  period              text not null,                                        -- 帰属月 YYYY-MM（設計§7-5）
  base_amount         bigint not null default 0,                            -- 凍結時点の適用ベース（税抜）
  rate                numeric,                                              -- 0.5 / 0.05 / null(月額)
  amount              bigint not null default 0,                            -- 請求額（税抜）
  tax_treatment       text not null default 'taxable_excl',                 -- 課税・税別建て（設計§7-1）
  snapshot            jsonb,                                                -- 自己完結の根拠（顧客ラベル・内訳・fee_snapshot写し）
  status              text not null default 'unbilled' check (status in ('unbilled','invoiced','settled')),
  frozen_at           timestamptz not null default now(),
  invoiced_at         timestamptz,
  settled_at          timestamptz,
  note                text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- 多重凍結防止: 案件行は (deal_id,kind,period) 一意／月額等の非案件行は (supplier,kind,period) 一意
create unique index if not exists supplier_charges_deal_uniq
  on public.supplier_charges (deal_id, kind, period) where deal_id is not null;
create unique index if not exists supplier_charges_flat_uniq
  on public.supplier_charges (supplier_partner_id, kind, period) where deal_id is null;
create index if not exists supplier_charges_supplier_period_idx
  on public.supplier_charges (supplier_partner_id, period);

alter table public.supplier_charges enable row level security;  -- ポリシー無し＝service_roleのみ（面公開禁止・設計§7-8）
grant all on public.supplier_charges to service_role;
