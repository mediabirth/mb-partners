-- ============================================================
-- 直営業基盤 DDL — Supabase SQL Editor で実行（Run①→Run②の順）。CCはDDL不可。
-- 目的: システムパートナー(is_system)を close_month の払出対象から除外する追加ガード。
-- 不変保証: 既存に is_system=true 行は無い＝実在パートナーの集計は完全に no-op（¥755,000 不変）。
-- enum不使用・grant不要（既存関数の REVOKE は CREATE OR REPLACE で維持）。
-- ============================================================

-- ── Run① partners.is_system 追加（既存は default false で全行 false にバックフィル）。
alter table public.partners
  add column if not exists is_system boolean not null default false;

-- ── Run② close_month_batch を再定義：is_system=true パートナーを sweep から除外（1行追加のみ）。
create or replace function public.close_month_batch(target_month text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
    select
      p.id                 as partner_id,
      p.tax_type,
      sum(d.amount)::bigint as gross,
      count(d.id)::int      as deal_count,
      jsonb_agg(
        jsonb_build_object(
          'deal_id',       d.id,
          'customer_name', d.customer_name,
          'amount',        d.amount,
          'service_id',    d.service_id,
          'fixed_month',   d.fixed_month
        )
        order by d.created_at
      ) as deals_json
    from deals d
    join partners p on p.id = d.partner_id
    where d.status = 'confirmed'
      and coalesce(p.is_system, false) = false   -- ★追加ガード: システムパートナーは払出対象外
      and (
        case
          when d.fixed_month is not null
            then date_trunc('month', d.fixed_month::date)::date = v_month_start
          else
            date_trunc('month', d.created_at)::date = v_month_start
        end
      )
    group by p.id, p.tax_type
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
$$;

-- 既存の権限境界を維持（冪等・grant追加なし）。
revoke all on function public.close_month_batch(text) from public;
revoke all on function public.close_month_batch(text) from anon;
revoke all on function public.close_month_batch(text) from authenticated;
