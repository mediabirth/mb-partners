-- メニュー構造作り直し：menus(メニュー)＞menu_rewards(報酬・複数)＞各報酬にトリガー・協力タスク。
-- menus 0行/deals 0行ゆえ安全。GRANT/RLS 同梱。2026-06-28 / baseline d9eca98
BEGIN;
-- 1) menus から報酬カラム除去（メニュー＝名前のみ）
ALTER TABLE public.menus DROP COLUMN IF EXISTS reward_type;
ALTER TABLE public.menus DROP COLUMN IF EXISTS reward_value;
ALTER TABLE public.menus DROP COLUMN IF EXISTS reward_base;
ALTER TABLE public.menus DROP COLUMN IF EXISTS reward_trigger;

-- 2) menu_rewards（報酬・メニューの子・複数）
CREATE TABLE IF NOT EXISTS public.menu_rewards (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_id        uuid NOT NULL REFERENCES public.menus(id) ON DELETE CASCADE,
  reward_type    text NOT NULL DEFAULT 'fixed' CHECK (reward_type IN ('fixed','rate')),
  reward_value   numeric NOT NULL DEFAULT 0,
  reward_base    text,
  reward_trigger text,
  sort           integer NOT NULL DEFAULT 0,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menu_rewards_menu_idx ON public.menu_rewards(menu_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_rewards TO anon, authenticated, service_role;
ALTER TABLE public.menu_rewards ENABLE ROW LEVEL SECURITY;
CREATE POLICY menu_rewards_read  ON public.menu_rewards FOR SELECT TO authenticated USING (true);
CREATE POLICY menu_rewards_write ON public.menu_rewards TO authenticated
  USING      ((SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['owner'::user_role,'manager'::user_role]))
  WITH CHECK ((SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['owner'::user_role,'manager'::user_role]));

-- 3) 協力タスクを報酬単位に紐付け（reward_id）
ALTER TABLE public.cooperation_task_templates ADD COLUMN IF NOT EXISTS reward_id uuid REFERENCES public.menu_rewards(id) ON DELETE CASCADE;

-- 4) deals に reward_ref（申し込まれた報酬）
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS reward_ref uuid REFERENCES public.menu_rewards(id);
COMMIT;
-- ROLLBACK手順: DROP TABLE menu_rewards CASCADE; ALTER deals DROP reward_ref; ALTER cooperation_task_templates DROP reward_id;
--             （menus の報酬カラムは復旧不要＝0行）
