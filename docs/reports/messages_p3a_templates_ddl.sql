-- ============================================================================
-- メッセージ司令塔 Phase 3-A — テンプレート隔離表（監査用全文）
-- 適用日: 2026-06-24 / 適用: psql 直（Supabase prod）
-- ★新規隔離表 public.message_templates のみ。money/deals/帰属 に FK 張らず非接触。
-- ★RLS 有効＋ポリシー0（service_role のみ・messages と同方針）。additive・idempotent。
-- ============================================================================

create table if not exists public.message_templates (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  title       text not null,                         -- テンプレ名
  body        text,                                  -- 本文
  category    text,                                  -- 区分タグ（自由送信/あいさつ/案件連絡 等・将来3-Cで利用）
  channel     text,                                  -- line/email/both・null=汎用
  attachments jsonb,                                 -- テンプレ同梱画像の Storage パス [{type:'image',path}]
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_by  uuid
);

-- RLS 有効＋ポリシー0（明示policyなし＝anon/auth はデフォルト拒否、service_role はRLSバイパス）。
alter table public.message_templates enable row level security;
grant all on public.message_templates to service_role;

create index if not exists message_templates_active_sort_idx on public.message_templates (is_active, sort_order);
create index if not exists message_templates_category_idx     on public.message_templates (category);
