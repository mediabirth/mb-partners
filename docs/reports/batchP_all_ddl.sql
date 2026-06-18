-- ============================================================
-- Batch P 統合DDL — Supabase SQL Editor で1回実行（CCはDDL不可）
-- 目的：協力＝タスク達成型。タスクテンプレ＋deal実体タスク＋ゲート判定結果列。
-- 未実行でも壊れません（ゲートは fail-open＝タスク基盤が無ければ従来どおり協力レート）。
-- すべて service_role のみアクセス（RLS有効・ポリシー無し）。
-- ============================================================

-- ① タスクテンプレ（サービス/メニュー単位の協力タスク定義・運営が編集）
create table if not exists public.cooperation_task_templates (
  id          uuid primary key default gen_random_uuid(),
  service_id  text        not null,
  menu_id     uuid,                          -- null = サービスの全メニュー共通
  label       text        not null,
  kind        text        not null default 'manual',  -- 'auto' | 'manual'
  required    boolean     not null default true,
  trigger_key text,                          -- auto時のイベントキー（'meeting_set' | 'in_progress' 等）
  sort        int         not null default 0,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);
alter table public.cooperation_task_templates enable row level security;
grant all privileges on table public.cooperation_task_templates to service_role;
create index if not exists coop_task_tpl_service_idx on public.cooperation_task_templates(service_id);

-- ② deal実体タスク（協力deal作成時にテンプレから生成）
create table if not exists public.deal_tasks (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid        not null,
  template_id uuid,
  label       text        not null,
  kind        text        not null default 'manual',
  required    boolean     not null default true,
  trigger_key text,
  done        boolean     not null default false,
  done_at     timestamptz,
  done_by     uuid,
  note        text,
  sort        int         not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.deal_tasks enable row level security;
grant all privileges on table public.deal_tasks to service_role;
create index if not exists deal_tasks_deal_idx on public.deal_tasks(deal_id);
create unique index if not exists deal_tasks_uniq on public.deal_tasks(deal_id, template_id) where template_id is not null;

-- ③ ゲート判定結果（締め前のレート決定に使う effective_kind を記録）
alter table public.deals add column if not exists effective_kind text;

-- ④ seed：各サービス共通の協力タスク初期セット（menu_id null）。既存があるサービスはスキップ＝冪等。
insert into public.cooperation_task_templates (service_id, label, kind, required, trigger_key, sort)
select s.id, t.label, t.kind, t.required, t.trigger_key, t.sort
from (values
  ('案件対応を開始する',          'auto',   true, 'in_progress', 1),
  ('商談を設定する',              'auto',   true, 'meeting_set', 2),
  ('ヒアリング・提案を実施',      'manual', true, null,          3),
  ('価格・条件を合意',            'manual', true, null,          4),
  ('クロージング/納品フォロー',   'manual', true, null,          5)
) as t(label, kind, required, trigger_key, sort)
cross join (values ('moom'),('mh'),('reso'),('live'),('dx')) as s(id)
where not exists (select 1 from public.cooperation_task_templates x where x.service_id = s.id);
