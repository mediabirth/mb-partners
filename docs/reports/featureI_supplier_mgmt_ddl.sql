-- Feature I: サプライヤー管理UI化（設計正典v2＋2026-07-11指示）。追加型・冪等のみ。money非接触。
-- レートカード＝不変版方式（immutable versioning）: 行のUPDATE/DELETEは運用禁止（APIも提供しない）。
-- 改定＝新カード作成→サプライヤーへ付け替え（凍結済みfee_snapshot/supplier_chargesへは構造的に波及しない）。
create table if not exists public.rate_cards (
  id                   text primary key,          -- 'std-v1' / 'omnis-founding-v1' / 以後 'std-v2' 等
  name                 text not null,             -- 表示名
  half_commission_rate numeric not null default 0.5,   -- 他系統→サプライヤーメニュー: 粗利折半率
  payment_fee_rate     numeric,                   -- 同系統→自社: 決済手数料率（月額モデルはnull）
  monthly_fee          bigint,                    -- 同系統→自社: 月額固定（決済手数料モデルはnull）
  override_rate        numeric not null default 0.10,  -- 系統→MBメニュー: 法人override率
  version              int not null default 1,
  note                 text,
  created_at           timestamptz not null default now()
);
alter table public.rate_cards enable row level security;
grant all on public.rate_cards to service_role;

-- seed（既存コード定数・凍結値と同一ID＝'std-v1'。指示の standard-v1 はこの内部IDに対応）
insert into public.rate_cards (id, name, half_commission_rate, payment_fee_rate, monthly_fee, override_rate, version, note) values
 ('std-v1', '標準レートカード', 0.5, 0.05, null, 0.10, 1, '折半50%／決済手数料5%／法人override10%'),
 ('omnis-founding-v1', 'ファウンディング（オムニス）', 0.5, null, 50000, 0.10, 1, '折半50%／月額¥50,000(税別)／法人override10%')
on conflict (id) do nothing;

-- 付け替え履歴（標準移行オプションの実務・監査）
create table if not exists public.supplier_card_events (
  id                  uuid primary key default gen_random_uuid(),
  supplier_partner_id uuid not null references public.partners(id),
  event               text not null check (event in ('promoted','card_changed','suspended','resumed')),
  from_card           text,
  to_card             text,
  changed_by          uuid,
  note                text,
  created_at          timestamptz not null default now()
);
alter table public.supplier_card_events enable row level security;
grant all on public.supplier_card_events to service_role;
