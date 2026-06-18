-- ============================================================
-- Batch 2（コンソール統合整理）DDL — invites.kind に 'member' を許可（MBメンバー招待用）。
-- 既存は ('partner','vendor')。additive・冪等。partner/vendor 招待の挙動は不変。
-- ※ role enum user_role には 'manager' が既存（追加不要）。新規テーブル・列・grant なし。
-- ============================================================
alter table public.invites drop constraint if exists invites_kind_check;
alter table public.invites add  constraint invites_kind_check check (kind in ('partner', 'vendor', 'member'));
