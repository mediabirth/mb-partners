-- REF-1: 同時紹介の表示グループと、相談内容の表示専用メタデータ。
-- money計算・報酬snapshot・fee snapshot・既存状態には接続しない additive DDL。
alter table public.deals
  add column if not exists referral_group_id uuid,
  add column if not exists consult_meta jsonb;

create index if not exists deals_referral_group_id_idx
  on public.deals (referral_group_id)
  where referral_group_id is not null;

comment on column public.deals.referral_group_id is
  '同じ顧客入力から同時起票された案件を表示上まとめる識別子。money非接触。';
comment on column public.deals.consult_meta is
  '相談案件の領域・温度感・ひとこと。表示専用で報酬凍結には使用しない。';
