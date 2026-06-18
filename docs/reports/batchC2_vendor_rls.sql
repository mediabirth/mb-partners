-- ============================================================
-- MBプロジェクトP&L Phase C-2 DDL — Supabase SQL Editor（CCはDDL不可）
-- 目的：vendor が「自分の経費(expense_claims)・自分の支払(delivery_payout_items)」だけを SELECT できる多層防御RLS。
--       書込（経費申請・領収書保存）は /api/vendor/* が service_role で本人検証してから実行＝vendorのINSERT/UPDATE RLSは付与しない。
-- パートナー報酬/凍結/payout/frontier/billing/lib/pnl 無改修。承認は既存A-2b（コンソール=MB）のまま。
-- partner(authenticated)は該当行なし＝0件。console は service_role（RLSバイパス）。冪等。
-- ============================================================

-- ① expense_claims：自分の delivery 経由（割当→deliveries.auth_user_id）の経費だけ SELECT 可。
grant select on public.expense_claims to authenticated;
drop policy if exists vendor_read_own_expenses on public.expense_claims;
create policy vendor_read_own_expenses on public.expense_claims
  for select to authenticated
  using (
    delivery_assignment_id in (
      select da.id
      from public.delivery_assignments da
      join public.deliveries d on d.id = da.delivery_id
      where d.auth_user_id = auth.uid()
    )
  );

-- ② delivery_payout_items：自分の delivery の支払明細だけ SELECT 可。
grant select on public.delivery_payout_items to authenticated;
drop policy if exists vendor_read_own_payouts on public.delivery_payout_items;
create policy vendor_read_own_payouts on public.delivery_payout_items
  for select to authenticated
  using (
    delivery_id in (select id from public.deliveries where auth_user_id = auth.uid())
  );
