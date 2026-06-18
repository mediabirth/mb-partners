-- ============================================================
-- Phase C-1 補足DDL【必須】— invites.kind の CHECK 制約に 'vendor' を許可。
-- コントロールドテストで invites_kind_check が 'partner' のみ許可と判明したため追加。
-- 既存は 'partner' のみ使用中＝additive・安全。partner 招待の挙動は不変。冪等。
-- ※ enum user_role の 'vendor' は適用済み。本SQLは kind の CHECK だけを更新する。
-- ============================================================
alter table public.invites drop constraint if exists invites_kind_check;
alter table public.invites add  constraint invites_kind_check check (kind in ('partner', 'vendor'));
