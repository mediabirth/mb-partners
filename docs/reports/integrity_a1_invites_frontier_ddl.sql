-- 整合性プログラム A1: フロンティア意図のDB永続化（additive only）
alter table public.invites add column if not exists is_frontier boolean not null default false;
