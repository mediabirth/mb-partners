-- Wave1-⑤：紹介ファネル計測テーブル（additive）。お金・お金系RLS・帰属・status には一切触れない別サイドチャネル。
-- deal_events は deal_id NOT NULL のため「送信前イベント(share/landing_view)」を表現できず＝新規が必要。
-- RLS: 有効＋ポリシー0 ＝ anon/authenticated は直 read/write 不可。書込は /api/funnel/track(service_role)、
--      読取は console 集計(service_role)。service_role は RLS バイパス。お金系RLSには非接触。
-- 実行：psql 直（DATABASE_URL）。2026-06-21 適用済み。冪等（IF NOT EXISTS）。
create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,                 -- 'share' | 'landing_view'
  channel text,                             -- 'mail'|'line'|'copy'|'qr'|null
  token text,
  partner_id uuid references public.partners(id) on delete set null,
  dedup_hash text,
  created_at timestamptz not null default now()
);
create index if not exists funnel_events_created_idx on public.funnel_events(created_at);
create index if not exists funnel_events_type_idx on public.funnel_events(event_type);
create index if not exists funnel_events_dedup_idx on public.funnel_events(dedup_hash);
alter table public.funnel_events enable row level security;
