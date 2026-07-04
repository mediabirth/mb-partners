-- コンソール完成: deal_items→services のFK欠落がPostgRESTのembedを壊し、
-- 一覧APIが劣化フォールバック（P&L列・明細なし）に落ちていた構造的根因の修復（additive・orphan 0件確認済み）
alter table public.deal_items
  add constraint deal_items_service_id_fkey
  foreign key (service_id) references public.services(id) on delete set null;
-- menu_id にも同様のembed利用があるため併せて（menus参照・orphan確認の上）
