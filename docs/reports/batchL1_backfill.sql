-- ============================================================
-- 案件明細化 Batch L1 バックフィル — batchL1_all_ddl.sql 実行後に流す。
-- 既存全dealを deal_items 1行へ複製（現 service_id/menu_id/kind/amount/base_amount をコピー）。
-- 冪等：明細が無いdealのみ insert。再実行安全。reward/deals は一切変更しない（明細を持つだけ）。
-- ============================================================

-- ① 1deal = 1明細をバックフィル（kind は channel × メニュー種別から導出＝作成パスと同じ規則）
insert into public.deal_items (deal_id, service_id, menu_id, kind, amount, base_amount, sort)
select d.id, d.service_id, d.menu_id,
  case
    when d.channel in ('cooperation','frontier') then coalesce(m.coop_type, 'fixed')
    when d.channel = 'referral'                  then coalesce(m.ref_type,  'fixed')
    else 'fixed'
  end as kind,
  d.amount, d.base_amount, 0
from public.deals d
left join public.service_menus m on m.id = d.menu_id
where not exists (select 1 from public.deal_items x where x.deal_id = d.id);

-- ② （任意・冪等）単一明細dealの整合：item を deal の現値へ揃え Σ(items)=deals.amount を保つ。
--    rate案件の確定で deals.amount が後から動いた場合に、再実行すれば item 側を追従できる。
--    deals は読むだけ・変更しない（明細側のみ更新）。
update public.deal_items i
set amount = d.amount, base_amount = d.base_amount, updated_at = now()
from public.deals d
where i.deal_id = d.id
  and (select count(*) from public.deal_items x where x.deal_id = d.id) = 1
  and (i.amount is distinct from d.amount or i.base_amount is distinct from d.base_amount);

-- 検証クエリ（実行後に確認）：
--   全dealが明細1行以上を持つか（0件であるべき）：
--     select count(*) from deals d where not exists (select 1 from deal_items x where x.deal_id=d.id);
--   Σ(items.amount) と deals.amount の不一致（0件であるべき）：
--     select d.id, d.amount, coalesce(sum(i.amount),0) s from deals d
--     left join deal_items i on i.deal_id=d.id group by d.id, d.amount having d.amount <> coalesce(sum(i.amount),0);
