-- パートナー別報酬率 P1（設計正典: docs/design/partner-reward-override-design.md §1）・additive only
create table if not exists partner_reward_overrides (
  id uuid primary key default gen_random_uuid(),
  supplier_partner_id uuid not null references partners(id),
  partner_id uuid not null references partners(id),
  reward_id uuid references menu_rewards(id) on delete cascade,  -- null = サプライヤー全メニュー（rate型のみ）
  override_value numeric not null,
  note text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, reward_id)
);
create unique index if not exists partner_reward_overrides_all_menu_uniq
  on partner_reward_overrides (partner_id, supplier_partner_id) where reward_id is null;

-- service_role へのGRANT（psql作成テーブルは既定権限が付かない場合がある・RLSなし＝service_roleのみの境界は維持）
grant all on table partner_reward_overrides to service_role;
