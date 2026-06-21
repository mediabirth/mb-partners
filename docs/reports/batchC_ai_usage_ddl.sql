-- バッチC（AI紹介文ドラフト）：partnerごとの日次レート上限カウンタ（隔離・追加のみ）。
-- ★お金・deals・帰属・既存RLS には一切関与しない補助テーブル。テキスト生成のレート制御専用。
-- RLS: 有効＋ポリシー0 ＝ 匿名/authenticated は直アクセス不可。読み書きは service_role(/api/ai/draft-intro)のみ。
-- ★GRANT教訓：psql作成テーブルは service_role への grant が無いと permission denied。明示付与する。
-- 実行：psql 直（DATABASE_URL）。2026-06-21 適用済み。冪等。
create table if not exists public.ai_usage (
  partner_id uuid not null,
  day date not null,
  count int not null default 0,
  primary key (partner_id, day)
);
alter table public.ai_usage enable row level security;
grant all on public.ai_usage to service_role;
