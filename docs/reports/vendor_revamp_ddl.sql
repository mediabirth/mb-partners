-- ベンダー全面ブラッシュアップ DDL — additive のみ。money(委託費計算/payout_items ¥142,318)・パートナー側は不変。
BEGIN;

-- 1) MB↔ベンダー 双方向チャット：delivery_updates に sender。kind='message' をチャットに使用（既存 note/flag 不変）。
ALTER TABLE public.delivery_updates ADD COLUMN IF NOT EXISTS sender text NOT NULL DEFAULT 'vendor';

-- 2) スケジュール（日程候補＝MB提示・ベンダー選択／予定＝納品期限/撮影/クローズ等）
CREATE TABLE IF NOT EXISTS public.delivery_schedule (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_assignment_id uuid NOT NULL REFERENCES public.delivery_assignments(id) ON DELETE CASCADE,
  row_type               text NOT NULL CHECK (row_type IN ('proposal','event')),
  label                  text,
  event_type             text,           -- バッジ種別：納品期限/撮影/クローズ/打合せ 等
  event_date             date,           -- event の日付 / proposal 確定後の確定日
  proposed_dates         date[],         -- proposal の候補日（複数）
  status                 text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed')),
  sort                   int  NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_schedule TO anon, authenticated, service_role;
ALTER TABLE public.delivery_schedule ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS delivery_schedule_read  ON public.delivery_schedule;
DROP POLICY IF EXISTS delivery_schedule_write ON public.delivery_schedule;
CREATE POLICY delivery_schedule_read ON public.delivery_schedule FOR SELECT TO authenticated USING (true);
CREATE POLICY delivery_schedule_write ON public.delivery_schedule FOR ALL TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','manager'))
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner','manager'));
CREATE INDEX IF NOT EXISTS delivery_schedule_assign_idx ON public.delivery_schedule(delivery_assignment_id);

-- 3) deliveries プロフィール拡張（職種 kind は列保持・非表示。本人確認lock項目＝振込先/インボイス/税区分）
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS nickname         text;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS display_code     text;   -- ID バッジ（例 KT8842）
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS phone            text;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS address          text;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS tax_type         text;   -- 個人/法人
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS bank_name        text;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS bank_branch      text;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS bank_account     text;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS bank_holder_kana text;
ALTER TABLE public.deliveries ADD COLUMN IF NOT EXISTS invoice_number   text;

COMMIT;

-- 4) delivery_updates.kind に message を追加（チャット用・note/flag 不変）
ALTER TABLE public.delivery_updates DROP CONSTRAINT delivery_updates_kind_check;
ALTER TABLE public.delivery_updates ADD CONSTRAINT delivery_updates_kind_check CHECK (kind IN ('note','flag','message'));
