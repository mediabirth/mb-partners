-- サプライヤー自己設定（B）・additive only
alter table services add column if not exists supplier_memo text;  -- 社内向けメモ（サプライヤー本人が即時編集・console詳細にも表示）
create table if not exists supplier_change_requests (
  id uuid primary key default gen_random_uuid(),
  supplier_partner_id uuid not null references partners(id),
  service_id text not null,
  menu_id uuid,
  kind text not null check (kind in ('public_description','image','menu_name','visibility')),
  payload jsonb not null,          -- { value: ... }
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason text,                     -- 却下理由 等
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid
);
grant all on table supplier_change_requests to service_role;
