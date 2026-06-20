-- batchPerf：vendor 性能改善で判明した唯一のindex欠落を補う。
-- 背景：loadVendorBundle の gating クエリは delivery_assignments を delivery_id で絞るが、
--       delivery_assignments の index は deal_id / deal_item_id のみで delivery_id 未index＝seq scan。
--       他の vendor hot 列（*_assignment_id / payout の delivery_id / deliveries.auth_user_id）は既存indexあり。
--
-- 実行：Supabase SQL Editor で手動実行（CONCURRENTLY はトランザクション外実行が必須のため db push 不可）。
--       IF NOT EXISTS で冪等。結果・お金・RLS・権限には一切影響しない純追加。
create index concurrently if not exists delivery_assignments_delivery_idx
  on public.delivery_assignments(delivery_id);
