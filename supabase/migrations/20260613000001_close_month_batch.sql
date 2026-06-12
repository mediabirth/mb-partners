-- ============================================================
-- M3: close_month_batch() — 月次締め処理
-- ============================================================
-- 実行権限: service_role のみ（SECURITY DEFINER + revoke）
-- 冪等性: 同月を複数回呼んでも結果は同じ
-- ============================================================

CREATE OR REPLACE FUNCTION public.close_month_batch(target_month text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start  date;
  v_month_end    date;
  v_batch_id     uuid;
  v_batch_status text;
  v_partner      record;
  v_result       jsonb;
  v_partner_count int := 0;
  v_total_gross  bigint := 0;
  v_total_wh     bigint := 0;
  v_total_net    bigint := 0;
BEGIN
  -- ── 入力検証 ─────────────────────────────────────────────────
  -- target_month は 'YYYY-MM' 形式を期待
  BEGIN
    v_month_start := (target_month || '-01')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid target_month format: %. Expected YYYY-MM', target_month;
  END;
  v_month_end := (date_trunc('month', v_month_start) + interval '1 month - 1 day')::date;

  -- ── 既存バッチ確認（paid なら abort）────────────────────────
  SELECT id, status INTO v_batch_id, v_batch_status
  FROM payout_batches
  WHERE month = v_month_start;

  IF v_batch_status = 'paid' THEN
    RAISE EXCEPTION 'batch for % is already paid and cannot be re-closed', target_month;
  END IF;

  -- ── バッチ作成または再オープン ─────────────────────────────
  IF v_batch_id IS NULL THEN
    INSERT INTO payout_batches (month, status)
    VALUES (v_month_start, 'open')
    RETURNING id INTO v_batch_id;
  END IF;

  -- ── 既存 payout_items を削除（冪等）────────────────────────
  DELETE FROM payout_items WHERE batch_id = v_batch_id;

  -- ── パートナー別集計 ─────────────────────────────────────
  FOR v_partner IN
    SELECT
      p.id                 AS partner_id,
      p.tax_type,
      SUM(d.amount)::bigint AS gross,
      COUNT(d.id)::int      AS deal_count,
      jsonb_agg(
        jsonb_build_object(
          'deal_id',       d.id,
          'customer_name', d.customer_name,
          'amount',        d.amount,
          'service_id',    d.service_id,
          'fixed_month',   d.fixed_month
        )
        ORDER BY d.created_at
      ) AS deals_json
    FROM deals d
    JOIN partners p ON p.id = d.partner_id
    WHERE d.status = 'confirmed'
      AND (
        -- fixed_month 指定がある場合はその月、ない場合は created_at の月
        CASE
          WHEN d.fixed_month IS NOT NULL
            THEN date_trunc('month', d.fixed_month::date)::date = v_month_start
          ELSE
            date_trunc('month', d.created_at)::date = v_month_start
        END
      )
    GROUP BY p.id, p.tax_type
  LOOP
    DECLARE
      v_wh  bigint;
      v_net bigint;
    BEGIN
      -- 源泉計算: 個人のみ round(gross * 0.1021)
      IF v_partner.tax_type = 'individual' THEN
        v_wh := ROUND(v_partner.gross * 0.1021);
      ELSE
        v_wh := 0;
      END IF;
      v_net := v_partner.gross - v_wh;

      -- payout_items 挿入
      INSERT INTO payout_items (batch_id, partner_id, gross, withholding, net, statement)
      VALUES (
        v_batch_id,
        v_partner.partner_id,
        v_partner.gross,
        v_wh,
        v_net,
        jsonb_build_object(
          'deals',      v_partner.deals_json,
          'deal_count', v_partner.deal_count,
          'tax_type',   v_partner.tax_type
        )
      );

      -- 集計
      v_partner_count := v_partner_count + 1;
      v_total_gross   := v_total_gross + v_partner.gross;
      v_total_wh      := v_total_wh + v_wh;
      v_total_net     := v_total_net + v_net;

      -- パートナーへ通知
      INSERT INTO notifications (partner_id, title, body, ref)
      VALUES (
        v_partner.partner_id,
        target_month || '月の報酬明細が発行されました',
        '手取り ¥' || to_char(v_net, 'FM999,999,999') || ' が振込予定です',
        jsonb_build_object('type', 'payout', 'batch_id', v_batch_id)
      );
    END;
  END LOOP;

  -- ── バッチを closed に更新 ────────────────────────────────
  UPDATE payout_batches
  SET status    = 'closed',
      closed_at = now()
  WHERE id = v_batch_id;

  -- ── 結果返却 ─────────────────────────────────────────────
  v_result := jsonb_build_object(
    'batch_id',      v_batch_id,
    'month',         target_month,
    'partner_count', v_partner_count,
    'total_gross',   v_total_gross,
    'total_wh',      v_total_wh,
    'total_net',     v_total_net
  );
  RETURN v_result;
END;
$$;

-- ── 権限設定: 一般ユーザーから実行不可 ───────────────────────
REVOKE ALL ON FUNCTION public.close_month_batch(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_month_batch(text) FROM anon;
REVOKE ALL ON FUNCTION public.close_month_batch(text) FROM authenticated;
-- service_role は SECURITY DEFINER で bypass するため GRANT 不要
