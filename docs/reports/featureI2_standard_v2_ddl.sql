-- Feature I-2: 標準レートカードv2（パススルー＋受注額手数料）・additive only
-- fee_model: 'half_commission'（折半・粗利ベース＝オムニス個別カード用として存続）
--          | 'passthrough'（系統外=報酬パススルー＋受注額(税抜)×revenue_fee_rate をサプライヤーに請求）
alter table rate_cards add column if not exists fee_model text not null default 'half_commission';
alter table rate_cards add column if not exists revenue_fee_rate numeric;
alter table rate_cards add column if not exists deprecated boolean not null default false;

-- standard-v2 seed（系統外=パススルー+受注額5%／系統内=決済5%／override10%）
insert into rate_cards (id, name, half_commission_rate, payment_fee_rate, monthly_fee, override_rate, version, note, fee_model, revenue_fee_rate)
values ('standard-v2', '標準v2（パススルー＋受注額5%）', 0.5, 0.05, null, 0.10, 2,
        '系統外=パートナー報酬パススルー＋MB手数料=受注額(税抜)5%を別建て請求／系統内=決済5%／override10%。粗利ベース折半は個別カード専用。',
        'passthrough', 0.05)
on conflict (id) do nothing;

-- std-v1 は未使用のため廃止（レート値は不変・選択不可フラグのみ＝不変版方式の値書換禁止に非抵触）
update rate_cards set deprecated = true where id = 'std-v1';

-- 凍結行の kind に passthrough_revenue_fee を追加（許容拡大のみ・既存データ非接触）
alter table supplier_charges drop constraint if exists supplier_charges_kind_check;
alter table supplier_charges add constraint supplier_charges_kind_check
  check (kind = any (array['half_commission'::text, 'passthrough_revenue_fee'::text, 'payment_fee_5'::text, 'omnis_monthly'::text]));
