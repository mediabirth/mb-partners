-- ============================================================
-- V-2 デリバリー プロジェクト管理 vendor RLS — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：vendor が「自分の割当の」タスク/成果物/進捗メモを SELECT できる多層防御RLS（読取のみ）。
--       書込（タスク完了・成果物・メモ/フラグ）は /api/vendor/* が service_role で本人検証して実行＝vendor INSERT/UPDATE RLSは付与しない。
--       deals.delivery_brief は vendor ページが service_role で本人の割当に限定して取得（deals に vendor RLS は付与しない＝他列を露出しない）。
--       storage delivery-files は署名URL（サーバ発行）で読取＝vendor storage policy は付与しない。
-- 不変：reward/frozen/payout/payout_overrides/delivery_payout_items/close_month_batch/frontier/billing/lib/pnl・お金系RLS 無改修。
-- partner(authenticated) は該当行なし＝0件。console は service_role（バイパス）。enum/新規テーブルなし。冪等。1Run。
-- ============================================================

-- 共通：本人の割当 id（割当→deliveries.auth_user_id＝auth.uid）に限定。
-- ① delivery_tasks
grant select on public.delivery_tasks to authenticated;
drop policy if exists vendor_read_own_tasks on public.delivery_tasks;
create policy vendor_read_own_tasks on public.delivery_tasks
  for select to authenticated
  using (
    delivery_assignment_id in (
      select da.id from public.delivery_assignments da
      join public.deliveries d on d.id = da.delivery_id
      where d.auth_user_id = auth.uid()
    )
  );

-- ② delivery_deliverables
grant select on public.delivery_deliverables to authenticated;
drop policy if exists vendor_read_own_deliverables on public.delivery_deliverables;
create policy vendor_read_own_deliverables on public.delivery_deliverables
  for select to authenticated
  using (
    delivery_assignment_id in (
      select da.id from public.delivery_assignments da
      join public.deliveries d on d.id = da.delivery_id
      where d.auth_user_id = auth.uid()
    )
  );

-- ③ delivery_updates
grant select on public.delivery_updates to authenticated;
drop policy if exists vendor_read_own_updates on public.delivery_updates;
create policy vendor_read_own_updates on public.delivery_updates
  for select to authenticated
  using (
    delivery_assignment_id in (
      select da.id from public.delivery_assignments da
      join public.deliveries d on d.id = da.delivery_id
      where d.auth_user_id = auth.uid()
    )
  );
