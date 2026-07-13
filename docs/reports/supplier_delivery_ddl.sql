-- サプライヤー・デリバリー（v6）: 委託先の所有区分（additive・NULL=MB直の従来委託先）
alter table deliveries add column if not exists supplier_partner_id uuid references partners(id);
