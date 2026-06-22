-- SYNAPSE Phase 0：パートナー“私的”関係資本台帳（隔離・非金銭・本人のみ）。
-- ★これはパートナー本人だけの私的データ。MB共有DBには吸い上げない・横断利用しない。
-- ★お金・deals・frontier・/r帰属・既存通知トリガとは一切無関係の独立テーブル。
-- RLS：read/write とも本人のみ（partner_id が「自分の partners 行」であること＝partners.profile_id = auth.uid()）。
--      AIエンドポイント等の service_role も許可（APIは常に“リクエスト元本人の partner_id”にスコープして操作）。
-- ★GRANT教訓：psql作成テーブルは明示付与が必要。service_role（API用）＋authenticated（本人RLS直アクセス用）。
-- 実行：psql 直（DATABASE_URL）。2026-06-22 適用。冪等。
create table if not exists public.synapse_contacts (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.partners(id) on delete cascade,
  name         text,
  company      text,
  industry     text,
  role         text,
  relationship text,
  needs        text,
  notes        text,
  source       text not null default 'manual' check (source in ('interview','card','manual')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists synapse_contacts_partner_idx on public.synapse_contacts (partner_id, created_at desc);

alter table public.synapse_contacts enable row level security;

-- 本人のみ all（select/insert/update/delete）。partner_id は「自分の partners 行」のみ。
drop policy if exists synapse_owner_all on public.synapse_contacts;
create policy synapse_owner_all on public.synapse_contacts
  for all to authenticated
  using      (partner_id in (select id from public.partners where profile_id = auth.uid()))
  with check (partner_id in (select id from public.partners where profile_id = auth.uid()));

grant select, insert, update, delete on public.synapse_contacts to authenticated;
grant all on public.synapse_contacts to service_role;
