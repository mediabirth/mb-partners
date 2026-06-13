-- M5: calendar_links.partner_id に UNIQUE 制約を追加
-- (20260613000020 でカラム追加したが UNIQUE 制約が欠けていた)
ALTER TABLE calendar_links
  ADD CONSTRAINT calendar_links_partner_id_key UNIQUE (partner_id);
