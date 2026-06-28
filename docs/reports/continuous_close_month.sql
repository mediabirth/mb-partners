-- close_month_batch(text) を拡張：継続報酬の月次確定（continuous_payouts.confirmed）を
-- 当月 period_month のパートナー別 gross に UNION ALL で加算する。
-- ★既存 fixed/rate の集計（deals.amount）は1文字も変えない。継続レコードが無い月は
--   UNION(b) が0行＝従来と完全一致（payout_items ¥142,318 不変）。源泉 round(gross*0.1021) は
--   gross に継続が乗るため自動的に継続込みになる。
CREATE OR REPLACE FUNCTION public.close_month_batch(target_month text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
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
  begin
    begin
      v_month_start := (target_month || '-01')::date;
    exception when others then
      raise exception 'invalid target_month format: %. Expected YYYY-MM', target_month;
    end;
    v_month_end := (date_trunc('month', v_month_start) + interval '1 month - 1 day')::date;

    select id, status into v_batch_id, v_batch_status
    from payout_batches
    where month = v_month_start;

    if v_batch_status = 'paid' then
      raise exception 'batch for % is already paid and cannot be re-closed', target_month;
    end if;

    if v_batch_id is null then
      insert into payout_batches (month, status)
      values (v_month_start, 'open')
      returning id into v_batch_id;
    end if;

    delete from payout_items where batch_id = v_batch_id;

    for v_partner in
      with src as (
        -- (a) 既存：確定 deals.amount（fixed/rate。継続案件は amount=0＝寄与ゼロ）。従来と同一条件。
        select
          d.partner_id,
          p.tax_type,
          d.amount::bigint as amount,
          jsonb_build_object(
            'deal_id',       d.id,
            'customer_name', d.customer_name,
            'amount',        d.amount,
            'service_id',    d.service_id,
            'fixed_month',   d.fixed_month
          ) as item,
          d.created_at as ord
        from deals d
        join partners p on p.id = d.partner_id
        where d.status = 'confirmed'
          and coalesce(p.is_system, false) = false
          and (
            case
              when d.fixed_month is not null
                then date_trunc('month', d.fixed_month::date)::date = v_month_start
              else
                date_trunc('month', d.created_at)::date = v_month_start
            end
          )
        union all
        -- (b) 継続：当月 period_month の confirmed continuous_payouts（パートナーは deal 経由）。
        --     継続レコードが無い月は0行＝従来と完全一致。
        select
          d.partner_id,
          p.tax_type,
          cp.confirmed_amount::bigint as amount,
          jsonb_build_object(
            'deal_id',          cp.deal_id,
            'customer_name',    d.customer_name,
            'amount',           cp.confirmed_amount,
            'service_id',       d.service_id,
            'continuous_month', to_char(cp.period_month, 'YYYY-MM')
          ) as item,
          cp.confirmed_at as ord
        from continuous_payouts cp
        join deals d     on d.id = cp.deal_id
        join partners p  on p.id = d.partner_id
        where cp.status = 'confirmed'
          and coalesce(p.is_system, false) = false
          and date_trunc('month', cp.period_month)::date = v_month_start
      )
      select
        partner_id,
        tax_type,
        sum(amount)::bigint as gross,
        count(*)::int       as deal_count,
        jsonb_agg(item order by ord) as deals_json
      from src
      group by partner_id, tax_type
    loop
      declare
        v_wh  bigint;
        v_net bigint;
      begin
        if v_partner.tax_type = 'individual' then
          v_wh := round(v_partner.gross * 0.1021);
        else
          v_wh := 0;
        end if;
        v_net := v_partner.gross - v_wh;

        insert into payout_items (batch_id, partner_id, gross, withholding, net, statement)
        values (
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

        v_partner_count := v_partner_count + 1;
        v_total_gross   := v_total_gross + v_partner.gross;
        v_total_wh      := v_total_wh + v_wh;
        v_total_net     := v_total_net + v_net;

        insert into notifications (partner_id, title, body, ref)
        values (
          v_partner.partner_id,
          target_month || '月の報酬明細が発行されました',
          '手取り ¥' || to_char(v_net, 'FM999,999,999') || ' が振込予定です',
          jsonb_build_object('type', 'payout', 'batch_id', v_batch_id)
        );
      end;
    end loop;

    update payout_batches
    set status    = 'closed',
        closed_at = now()
    where id = v_batch_id;

    v_result := jsonb_build_object(
      'batch_id',      v_batch_id,
      'month',         target_month,
      'partner_count', v_partner_count,
      'total_gross',   v_total_gross,
      'total_wh',      v_total_wh,
      'total_net',     v_total_net
    );
    return v_result;
  end;
  $function$;
