-- LINE配線 L-A：partner→LINEユーザー紐付けテーブル（additive）。お金・お金系RLS・帰属・status に非接触。
-- 今回は空でOK（紐付けUIは L-B）。紐付けゼロの間 LINEチャネルは graceful skip。
-- RLS: 有効＋ポリシー0 ＝ anon/authenticated 直アクセス遮断。読書きは service_role のみ。
-- ★GRANT教訓：psql作成テーブルは service_role への grant が無いと permission denied。明示付与する。
-- 実行：psql 直（DATABASE_URL）。2026-06-21 適用済み。冪等（IF NOT EXISTS）。
create table if not exists public.partner_line_links (
  partner_id uuid primary key references public.partners(id) on delete cascade,
  line_user_id text not null,
  linked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.partner_line_links enable row level security;
grant all on public.partner_line_links to service_role;
