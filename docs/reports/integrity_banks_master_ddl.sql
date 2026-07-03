-- 整合性プログラム B: 銀行・支店マスタ（全銀協データ zengin-code 由来・additive only）
-- 外部API依存を排し、公開データをDBに保持（更新はCSV再取込みで保守可能）
create table if not exists public.banks (
  code text primary key,
  name text not null,
  kana text,
  hira text,
  roma text,
  updated_at timestamptz not null default now()
);
create table if not exists public.bank_branches (
  bank_code text not null references public.banks(code) on delete cascade,
  code text not null,
  name text not null,
  kana text,
  hira text,
  roma text,
  updated_at timestamptz not null default now(),
  primary key (bank_code, code)
);
create index if not exists bank_branches_bank_idx on public.bank_branches(bank_code);
alter table public.banks enable row level security;
alter table public.bank_branches enable row level security;
-- 公開マスタ（口座情報ではない）: 読み取りのみ全ロール許可
drop policy if exists banks_read on public.banks;
create policy banks_read on public.banks for select using (true);
drop policy if exists bank_branches_read on public.bank_branches;
create policy bank_branches_read on public.bank_branches for select using (true);
grant select on public.banks, public.bank_branches to anon, authenticated, service_role;
