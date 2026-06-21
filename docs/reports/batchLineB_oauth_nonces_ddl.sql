-- LINE配線 L-B fix：OAuth nonce のサーバ側 single-use 管理（additive）。
-- iOSでcallbackがセッションCookieを持たない文脈に着地するため、CSRF/リプレイ対策を cookie double-submit から
-- サーバ側 single-use nonce に置換。partner特定は署名済 state（偽造不可）から行いCookie非依存。お金・既存authに非接触。
-- RLS: 有効＋ポリシー0 ＝ 直アクセス遮断。読書きは service_role のみ。GRANT教訓に従い grant all to service_role。
-- 実行：psql 直（DATABASE_URL）。2026-06-21 適用済み。冪等（IF NOT EXISTS）。
create table if not exists public.line_oauth_nonces (
  nonce text primary key,
  partner_id uuid not null references public.partners(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists line_oauth_nonces_partner_idx on public.line_oauth_nonces(partner_id);
alter table public.line_oauth_nonces enable row level security;
grant all on public.line_oauth_nonces to service_role;
