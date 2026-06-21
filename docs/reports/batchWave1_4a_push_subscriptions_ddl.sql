-- Wave1-④a：Web Push 購読テーブル（additive）。お金・案件状態・お金系RLSには一切触れない。
-- RLS は既存 partner所有テーブル(notifications/referral_links)の流儀に合わせ「partner本人のみ自分の購読を read/insert/update/delete」。
-- 送信(dispatcher/test)は service_role(admin) で全件読取（RLSバイパス）＝送信側はRLS非依存。
-- 実行：psql 直（DATABASE_URL）。2026-06-21 適用済み。冪等（IF NOT EXISTS / drop policy if exists）。
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (partner_id, endpoint)
);
create index if not exists push_subscriptions_partner_idx on public.push_subscriptions(partner_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select on public.push_subscriptions;
drop policy if exists push_subscriptions_insert on public.push_subscriptions;
drop policy if exists push_subscriptions_update on public.push_subscriptions;
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select
  using (partner_id = (select id from public.partners where profile_id = auth.uid()));
create policy push_subscriptions_insert on public.push_subscriptions for insert
  with check (partner_id = (select id from public.partners where profile_id = auth.uid()));
create policy push_subscriptions_update on public.push_subscriptions for update
  using (partner_id = (select id from public.partners where profile_id = auth.uid()))
  with check (partner_id = (select id from public.partners where profile_id = auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete
  using (partner_id = (select id from public.partners where profile_id = auth.uid()));
