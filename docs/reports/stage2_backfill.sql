-- ============================================================================
-- 段階2：バックフィル — 旧 service_menus の2報酬を新 menus 行へ写像（read-only写像・additive INSERT のみ）
-- baseline a967a7e / 2026-06-27
--
-- 各 service_menus（=新「サービス」）の下に「メニュー（1報酬）」を menus 行として生成：
--   ref_enabled  → 1行（つなぐ／reward_type=ref_type・value=ref_value・base=ref_base・trigger=ref_trigger）
--   coop_enabled → 1行（伴走／reward_type=coop_type・value=coop_value・base=coop_base・trigger=ref_trigger共有）
-- 想定行数：ref 9 + coop 8 = 17。
-- ★旧 service_menus / deals / money は一切変更しない（menus への INSERT のみ）。
-- ★冪等：menus は段階1で新設・未使用ゆえ、全削除→再生成で安全に再実行できる。
-- ============================================================================

BEGIN;

-- 冪等化：既存の写像行をクリア（menus は未使用＝参照ゼロ・deals.menu_ref は全null）。
DELETE FROM public.menus;

-- 1) つなぐ（紹介報酬）行
INSERT INTO public.menus (service_menu_id, name, reward_type, reward_value, reward_base, reward_trigger, sort, active)
SELECT sm.id, sm.name || '（つなぐ）', sm.ref_type::text, sm.ref_value, sm.ref_base, sm.ref_trigger, 0, true
FROM public.service_menus sm
WHERE sm.ref_enabled;

-- 2) 伴走（協力報酬）行
INSERT INTO public.menus (service_menu_id, name, reward_type, reward_value, reward_base, reward_trigger, sort, active)
SELECT sm.id, sm.name || '（伴走）', sm.coop_type::text, COALESCE(sm.coop_value, 0), sm.coop_base, sm.ref_trigger, 1, true
FROM public.service_menus sm
WHERE sm.coop_enabled;

COMMIT;

-- ============================================================================
-- ROLLBACK（戻し手順）：DELETE FROM public.menus;  -- 写像分を全削除（menus 未使用ゆえ安全）
-- ============================================================================
