-- ============================================================================
-- カレンダー member-centric 再設計 段階1（土台・挙動ゼロ変化）
-- member_calendar_links 新表（段階C member_notification_prefs と対称）＋
-- 稼働中 kthk.kmbr トークンを owner(神原勝彦)行へ移送。
-- ★mb_calendar(id=1) は温存（営業時間/枠/バッファ＝org予約ポリシー・OAuthも当面そのまま）。
-- ★コードの書き込み/読み取り/UI は一切変更しない＝この段階では挙動ゼロ変化。
-- 適用先: 本番 Supabase（DATABASE_URL）。基準 HEAD=30dc585。
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.member_calendar_links (
  user_id      uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  google_email text,
  oauth_tokens jsonb,
  active       boolean NOT NULL DEFAULT true,
  connected_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- 既存 mb_calendar / member_notification_prefs と同方針：RLS有・ポリシー無・service_role のみ
ALTER TABLE public.member_calendar_links ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_calendar_links TO service_role;

-- kthk.kmbr トークンを owner(神原勝彦)行へ移送（mb_calendar id=1 はコピー元として温存・改変なし）
INSERT INTO public.member_calendar_links (user_id, google_email, oauth_tokens, active, connected_at)
SELECT p.id, c.google_email, c.oauth_tokens, c.active, now()
FROM public.profiles p, public.mb_calendar c
WHERE p.email = 'mediabirth.project@gmail.com' AND p.role = 'owner' AND c.id = 1
ON CONFLICT (user_id) DO NOTHING;

COMMIT;

-- Supabase 既定の anon/authenticated grant を剥がして mb_calendar と同等のロックダウンに
REVOKE ALL ON public.member_calendar_links FROM anon, authenticated;

-- ロールバック（段階1を戻す）：コード無改修のため表DROPのみで完全復帰
--   DROP TABLE public.member_calendar_links;
