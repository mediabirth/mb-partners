-- Feature M/LP: 応募の種別（パートナー応募/出品の相談）・additive only
alter table partner_applications add column if not exists kind text not null default 'partner';
