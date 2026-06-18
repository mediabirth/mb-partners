-- ============================================================
-- MBプロジェクトP&L Phase C-1 DDL — Supabase SQL Editor（CCはDDL不可）
-- 目的：vendor（業務委託先）ロール＆認証の土台。deliveries に auth_user_id を持たせ vendor ログインと紐付け。
--       vendor は「自分の担当割当（案件名/サービス・委託費・ステータス）」のみ閲覧（RLS で他者データ遮断）。
-- パートナー側(app)/コンソール(console) の認証・RLS・挙動は不変。payout/frozen/frontier/billing 無改修。
-- ※ role は enum 型 user_role のため、'vendor' の ADD VALUE は【別Run・先にコミット】が必須（PostgreSQL制約）。
-- ============================================================

-- ============================================================
-- 【Run #1・必須・単独実行】enum に 'vendor' を追加（※必ずこれだけを先に実行＝別トランザクションでコミット）
-- ============================================================
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'vendor';


-- ============================================================
-- 【Run #2・必須】Run #1 をコミット後に実行（列追加＋RLS）
-- ============================================================

-- ① deliveries に vendor ログインユーザーを紐付け（null可・1ユーザー=1委託先）
alter table public.deliveries
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;
create unique index if not exists deliveries_auth_user_idx
  on public.deliveries(auth_user_id) where auth_user_id is not null;

-- ② vendor 招待を deliveries に結びつけるため invites に delivery_id を追加（null可・既存partner招待は未使用）
alter table public.invites
  add column if not exists delivery_id uuid references public.deliveries(id) on delete cascade;

-- ③ RLS：vendor は「自分の deliveries / delivery_assignments」だけ SELECT 可。
--    console は service_role（RLSバイパス）／partner は該当行なし＝0件。書込は付与しない（C-2まで閲覧のみ）。
--    顧客受注額・パートナー報酬・MB粗利・他vendorは deals/その他テーブルに別途RLSが無いため到達不可。
grant select on public.deliveries           to authenticated;
grant select on public.delivery_assignments to authenticated;

drop policy if exists vendor_read_own_delivery on public.deliveries;
create policy vendor_read_own_delivery on public.deliveries
  for select to authenticated
  using (auth_user_id = auth.uid());

drop policy if exists vendor_read_own_assignments on public.delivery_assignments;
create policy vendor_read_own_assignments on public.delivery_assignments
  for select to authenticated
  using (
    delivery_id in (select id from public.deliveries where auth_user_id = auth.uid())
  );
