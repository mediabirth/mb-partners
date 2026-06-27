-- 是正2：協力タスクを6マスタ(フロント定数)＋メニュー単位(menu_id)選択に統一。
-- 旧サービス共通タスク(menu_id=null・25行・旧5項目モデル)を削除（deals 0件ゆえ参照なし＝安全）。
-- 6マスタ＝つなぐ/アポイント(auto)・ヒヤリング/アシストフォロー/価格条件合意/クロージング(manual)。
-- メニュー作成時に勝彦が必要なものを選ぶ→cooperation_task_templates(menu_id=menus.id)で記録。2026-06-28
DELETE FROM public.cooperation_task_templates WHERE menu_id IS NULL;
