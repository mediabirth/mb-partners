-- 継続報酬（毎月）対応 DDL — additive のみ。既存 fixed/rate・payout(¥142,318) は不変。
-- 適用先：本番 Supabase（psql + DATABASE_URL）。冪等。
BEGIN;

-- 1) menu_rewards: reward_type に 'continuous' を許可 ＋ default_months（デフォルト期間・月数）
ALTER TABLE public.menu_rewards DROP CONSTRAINT IF EXISTS menu_rewards_reward_type_check;
ALTER TABLE public.menu_rewards
  ADD CONSTRAINT menu_rewards_reward_type_check
  CHECK (reward_type IN ('fixed','rate','continuous'));
ALTER TABLE public.menu_rewards ADD COLUMN IF NOT EXISTS default_months integer;

-- 2) deals: 継続案件の期間（案件ごと可変・未設定ならメニューの default_months）
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS continuous_months integer;

-- 3) continuous_payouts: 継続報酬の月次レコード（1案件1月1件）
CREATE TABLE IF NOT EXISTS public.continuous_payouts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  reward_ref       uuid REFERENCES public.menu_rewards(id),
  period_month     date NOT NULL,                       -- 対象月（月初に正規化して保存）
  gross_input      numeric NOT NULL DEFAULT 0,          -- その月の入力粗利（将来は会計連携で自動取得に差替え可）
  confirmed_amount integer NOT NULL DEFAULT 0,          -- 確定額 = round(gross_input × 率 / 100)
  status           text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('draft','confirmed')),
  confirmed_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_id, period_month)
);
-- 生 CREATE TABLE は権限を継承しない → 明示 GRANT（PostgREST 42501 回避）
GRANT SELECT, INSERT, UPDATE, DELETE ON public.continuous_payouts TO anon, authenticated, service_role;
ALTER TABLE public.continuous_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS continuous_payouts_read  ON public.continuous_payouts;
DROP POLICY IF EXISTS continuous_payouts_write ON public.continuous_payouts;
CREATE POLICY continuous_payouts_read ON public.continuous_payouts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY continuous_payouts_write ON public.continuous_payouts
  FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','manager'))
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','manager'));

CREATE INDEX IF NOT EXISTS continuous_payouts_deal_idx   ON public.continuous_payouts(deal_id);
CREATE INDEX IF NOT EXISTS continuous_payouts_month_idx  ON public.continuous_payouts(period_month);

COMMIT;
