-- ============================================================================
-- 段階1：サービス/メニュー作り直し — スキーマ追加（全 additive・既存温存）
-- baseline 28d21e5 / 2026-06-27
--
-- 目標4階層：ブランド(services) ＞ サービス(service_menus) ＞ メニュー(新 menus・1報酬)
-- ★今回は「箱（スキーマ）を作るだけ」。バックフィル・表示・編集は後続段階。
-- ★既存テーブル(services/service_menus/deals/deal_items/cooperation_task_templates)の
--   既存カラム・データ・FK・RLS は一切変更しない（ADD/CREATE のみ）。
-- ============================================================================

-- 1) 新テーブル menus（メニュー＝1報酬）。service_menu_id が新「サービス」(現 service_menus)に属す。
CREATE TABLE IF NOT EXISTS public.menus (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_menu_id uuid NOT NULL REFERENCES public.service_menus(id) ON DELETE CASCADE,
  name            text NOT NULL,
  reward_type     text NOT NULL DEFAULT 'fixed' CHECK (reward_type IN ('fixed','rate')),
  reward_value    numeric NOT NULL DEFAULT 0,
  reward_base     text,                 -- rate時の基準。⑤に従い基本 '粗利'（nullable）
  reward_trigger  text,                 -- 成果地点（nullable）。※予約語回避のため trigger ではなく reward_trigger
  sort            integer NOT NULL DEFAULT 0,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menus_service_menu_idx ON public.menus(service_menu_id);

-- RLS：既存 service_menus と同等（公開読み取り＋owner/manager 書き込み）。
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
CREATE POLICY menus_read  ON public.menus FOR SELECT TO authenticated USING (true);
CREATE POLICY menus_write ON public.menus TO authenticated
  USING      ((SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['owner'::user_role,'manager'::user_role]))
  WITH CHECK ((SELECT profiles.role FROM profiles WHERE profiles.id = auth.uid()) = ANY (ARRAY['owner'::user_role,'manager'::user_role]));

-- 2) deals に menu_ref（新 menus 参照・nullable・additive）。既存 menu_id は温存（DROPしない）。
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS menu_ref uuid REFERENCES public.menus(id);

-- 3) cooperation_task_templates.menu_id（既存 uuid nullable 列）はそのまま活用（DDL変更なし）。

-- ============================================================================
-- ROLLBACK（戻し手順）：
--   ALTER TABLE public.deals DROP COLUMN IF EXISTS menu_ref;
--   DROP TABLE IF EXISTS public.menus;   -- menus はまだ未使用ゆえ参照ゼロで安全に DROP 可
-- ============================================================================
