-- v8: 変更申請のkind拡張（サービスマスタ全フィールド編集＝APPに正しく表示するため）
alter table supplier_change_requests drop constraint if exists supplier_change_requests_kind_check;
alter table supplier_change_requests add constraint supplier_change_requests_kind_check
  check (kind in ('public_description','image','menu_name','visibility',
                  'subtitle','category','description','who','target_audience','url',
                  'menu_short_description','menu_description'));
