-- GEN-4: digest/cardから起票までの計測用流入元。報酬・token帰属には使用しない。
alter table public.deals add column if not exists src text null;
