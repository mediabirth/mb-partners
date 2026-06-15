-- ④ パートナー登録フロー（4ステップ）で取得する情報の保存先。加算的・非破壊。
-- 電話/住所/インボイス番号、および規約・プライバシー同意の取得日時。
-- 税区分(tax_type)・口座(bank jsonb)は既存。姓名→profiles.name、ニックネーム→profiles.nickname(既存)。
alter table partners add column if not exists phone               text;
alter table partners add column if not exists address             text;
alter table partners add column if not exists invoice_number      text;
alter table partners add column if not exists terms_agreed_at     timestamptz;
alter table partners add column if not exists privacy_agreed_at   timestamptz;
