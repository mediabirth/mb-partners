-- Feature E（紹介→紹介の“賞賛”・非金銭）：partner_applications に紹介元の捕捉＋活性化マークを追加（追加のみ・隔離）。
-- ★これは金銭オーバーライドではない。frontier系(is_frontier/frontier_id/OVERRIDE_RATE/payout_overrides)とは一切無関係。
-- ★お金・deals・帰属(/r)・money RLS には一切関与しない。partner_applications は service_role 専用の隔離テーブル。
--  referrer_partner_id : 招待リンク /join?ref=<partner_id> 経由で応募した場合の紹介元 partner（nullable・FK・自己/無効はnull）。
--  referrer_linked_at  : 紹介元が紐づいた時刻（応募時）。
--  activated_at        : console での「承認＝仲間化」マーク。非null＝活性化済（賞賛通知の冪等キーも兼ねる）。
-- RLS: 既存のまま（有効＋ポリシー0＝service_roleのみ）。GRANT も B1 の grant all to service_role を据え置き（列はテーブル権限を継承）。
-- 実行：psql 直（DATABASE_URL）。2026-06-22 適用。冪等。
alter table public.partner_applications
  add column if not exists referrer_partner_id uuid references public.partners(id),
  add column if not exists referrer_linked_at timestamptz,
  add column if not exists activated_at timestamptz;
