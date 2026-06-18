-- ============================================================
-- 案件明細化 Batch L2 RLS — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：deal_items に「自分の担当dealの明細のみ SELECT 可」を追加（既存 deals の partner 基準と同等）。
-- console(service_role) は従来どおり全権（service_role は RLS バイパス＋GRANT済）。
-- 冪等：policy は drop→create。未実行でもアプリは壊れません（表示は service_role 経由のため動作）。
-- ============================================================

-- 念のため（L1で有効化済のはず・冪等）
alter table public.deal_items enable row level security;

-- パートナーは自分が担当する deal の明細のみ参照可（auth.uid() → partners.profile_id → deals.partner_id）
drop policy if exists deal_items_partner_select on public.deal_items;
create policy deal_items_partner_select on public.deal_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.deals d
      join public.partners p on p.id = d.partner_id
      where d.id = deal_items.deal_id
        and p.profile_id = auth.uid()
    )
  );

-- authenticated ロールにテーブル SELECT 権限を付与（RLSポリシーで行を絞る）
grant select on table public.deal_items to authenticated;

-- ※ 書込（insert/update/delete）は console の service_role のみ（partner には付与しない）。
