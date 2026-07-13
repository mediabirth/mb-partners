-- v9: 法人名（全構造共通・additive）。法人パートナー/サプライヤーの正式名称。
alter table partners add column if not exists company_name text;
