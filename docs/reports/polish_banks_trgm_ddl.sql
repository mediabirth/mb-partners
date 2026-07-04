-- 磨き④: 銀行マスタの名称部分一致検索を全走査からGINインデックスへ（additive・結果不変）
create extension if not exists pg_trgm;
create index if not exists banks_name_trgm_idx on public.banks using gin (name gin_trgm_ops);
create index if not exists banks_hira_trgm_idx on public.banks using gin (hira gin_trgm_ops);
create index if not exists banks_kana_trgm_idx on public.banks using gin (kana gin_trgm_ops);
create index if not exists bank_branches_name_trgm_idx on public.bank_branches using gin (name gin_trgm_ops);
create index if not exists bank_branches_hira_trgm_idx on public.bank_branches using gin (hira gin_trgm_ops);
