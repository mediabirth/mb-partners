-- 段階3 補修：新 menus テーブルの GRANT 不足を修正（service_menus と同等に）。
-- raw CREATE TABLE では Supabase の service_role/authenticated/anon に SELECT等が自動付与されないため、
-- PostgREST(service_role)が menus を読めず 42501 になる。RLS は別途有効（行制御はポリシーで担保）。
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menus TO anon, authenticated, service_role;
-- ROLLBACK: REVOKE SELECT, INSERT, UPDATE, DELETE ON public.menus FROM anon, authenticated, service_role;
