-- Seed: authoritative service configurations + referral menus
-- Pattern: UPDATE if exists, INSERT if not exists (no DO $$ blocks)

-- ── MOOM ─────────────────────────────────────────────────────────────────────
INSERT INTO services (name, subtitle, icon, color, active, sort, coop_enabled, coop_rate, coop_base, ft_trigger, ft_condition, coverage_steps)
SELECT 'MOOM', '賃貸仲介プラットフォーム', 'home', '#4733e6', true, 1,
  true, 50, '粗利', '共同仲介を担当', '宅建業免許が必要',
  '[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":true},{"label":"商談","included":true},{"label":"価格合意","included":true},{"label":"フォロー・アシスト","included":true}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'MOOM');

UPDATE services SET
  icon='home', color='#4733e6', sort=1,
  coop_enabled=true, coop_rate=50, coop_base='粗利',
  ft_trigger='共同仲介を担当', ft_condition='宅建業免許が必要',
  coverage_steps='[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":true},{"label":"商談","included":true},{"label":"価格合意","included":true},{"label":"フォロー・アシスト","included":true}]'::jsonb
WHERE name = 'MOOM';

UPDATE service_menus SET ref_type='fixed', ref_value=30000, ref_trigger='賃貸成約で確定', category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'MOOM' AND service_menus.name = '賃貸仲介成約';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, ref_trigger, sort)
SELECT s.id, '賃貸仲介成約', 'referral', 'fixed', 30000, '賃貸成約で確定', 0
FROM services s WHERE s.name = 'MOOM'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = '賃貸仲介成約');

-- ── MatchHub ─────────────────────────────────────────────────────────────────
INSERT INTO services (name, subtitle, icon, color, active, sort, coop_enabled, coop_rate, coop_base, ft_condition, coverage_steps)
SELECT 'MatchHub', '人材マッチングプラットフォーム', 'circles', '#1e9e6a', true, 2,
  true, 10, '売上', '求職者本人への接触は不可',
  '[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":false},{"label":"商談","included":false},{"label":"価格合意","included":false},{"label":"フォロー・アシスト","included":false}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'MatchHub');

UPDATE services SET
  icon='circles', color='#1e9e6a', sort=2,
  coop_enabled=true, coop_rate=10, coop_base='売上',
  ft_condition='求職者本人への接触は不可',
  coverage_steps='[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":false},{"label":"商談","included":false},{"label":"価格合意","included":false},{"label":"フォロー・アシスト","included":false}]'::jsonb
WHERE name = 'MatchHub';

UPDATE service_menus SET ref_type='fixed', ref_value=30000, ref_trigger='転職決定で確定', category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'MatchHub' AND service_menus.name = '転職サポート（個人）';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, ref_trigger, sort)
SELECT s.id, '転職サポート（個人）', 'referral', 'fixed', 30000, '転職決定で確定', 0
FROM services s WHERE s.name = 'MatchHub'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = '転職サポート（個人）');

UPDATE service_menus SET ref_type='fixed', ref_value=30000, ref_trigger='採用決定で確定', category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'MatchHub' AND service_menus.name = '採用企業の開拓';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, ref_trigger, sort)
SELECT s.id, '採用企業の開拓', 'referral', 'fixed', 30000, '採用決定で確定', 1
FROM services s WHERE s.name = 'MatchHub'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = '採用企業の開拓');

-- ── RESONATION ───────────────────────────────────────────────────────────────
INSERT INTO services (name, subtitle, icon, color, active, sort, coop_enabled, coop_rate, coop_base, coverage_steps)
SELECT 'RESONATION', 'クリエイティブ制作', 'aperture', '#8b5cf6', true, 3,
  true, 10, '利益',
  '[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":false},{"label":"商談","included":false},{"label":"価格合意","included":false},{"label":"フォロー・アシスト","included":false}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'RESONATION');

UPDATE services SET
  icon='aperture', color='#8b5cf6', sort=3,
  coop_enabled=true, coop_rate=10, coop_base='利益',
  coverage_steps='[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":false},{"label":"商談","included":false},{"label":"価格合意","included":false},{"label":"フォロー・アシスト","included":false}]'::jsonb
WHERE name = 'RESONATION';

UPDATE service_menus SET ref_type='fixed', ref_value=30000, category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'RESONATION' AND service_menus.name = '撮影';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, sort)
SELECT s.id, '撮影', 'referral', 'fixed', 30000, 0
FROM services s WHERE s.name = 'RESONATION'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = '撮影');

UPDATE service_menus SET ref_type='fixed', ref_value=50000, category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'RESONATION' AND service_menus.name = 'ロゴ';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, sort)
SELECT s.id, 'ロゴ', 'referral', 'fixed', 50000, 1
FROM services s WHERE s.name = 'RESONATION'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = 'ロゴ');

UPDATE service_menus SET ref_type='fixed', ref_value=100000, category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'RESONATION' AND service_menus.name = 'サイト制作';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, sort)
SELECT s.id, 'サイト制作', 'referral', 'fixed', 100000, 2
FROM services s WHERE s.name = 'RESONATION'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = 'サイト制作');

UPDATE service_menus SET ref_type='fixed', ref_value=300000, category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'RESONATION' AND service_menus.name = '受託開発';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, sort)
SELECT s.id, '受託開発', 'referral', 'fixed', 300000, 3
FROM services s WHERE s.name = 'RESONATION'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = '受託開発');

-- ── PRAGMATION ───────────────────────────────────────────────────────────────
INSERT INTO services (name, subtitle, icon, color, active, sort, coop_enabled, coop_rate, coop_base, coverage_steps)
SELECT 'PRAGMATION', 'DX・AI導入支援', 'fund', '#0ea5e9', true, 4,
  true, 10, '利益',
  '[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":false},{"label":"商談","included":false},{"label":"価格合意","included":false},{"label":"フォロー・アシスト","included":false}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'PRAGMATION');

UPDATE services SET
  icon='fund', color='#0ea5e9', sort=4,
  coop_enabled=true, coop_rate=10, coop_base='利益',
  coverage_steps='[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":false},{"label":"商談","included":false},{"label":"価格合意","included":false},{"label":"フォロー・アシスト","included":false}]'::jsonb
WHERE name = 'PRAGMATION';

UPDATE service_menus SET ref_type='fixed', ref_value=40000, ref_trigger='導入契約で確定', category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'PRAGMATION' AND service_menus.name = 'DX・AI導入';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, ref_trigger, sort)
SELECT s.id, 'DX・AI導入', 'referral', 'fixed', 40000, '導入契約で確定', 0
FROM services s WHERE s.name = 'PRAGMATION'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = 'DX・AI導入');

-- ── EMANATION ────────────────────────────────────────────────────────────────
INSERT INTO services (name, subtitle, icon, color, active, sort, coop_enabled, coop_rate, coop_base, coverage_steps)
SELECT 'EMANATION', 'DX・AI導入支援', 'fund', '#c07a12', true, 5,
  true, 10, '利益',
  '[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":false},{"label":"商談","included":false},{"label":"価格合意","included":false},{"label":"フォロー・アシスト","included":false}]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'EMANATION');

UPDATE services SET
  icon='fund', color='#c07a12', sort=5,
  coop_enabled=true, coop_rate=10, coop_base='利益',
  coverage_steps='[{"label":"つなぐ","included":true},{"label":"アポイント設定","included":false},{"label":"商談","included":false},{"label":"価格合意","included":false},{"label":"フォロー・アシスト","included":false}]'::jsonb
WHERE name = 'EMANATION';

UPDATE service_menus SET ref_type='fixed', ref_value=40000, ref_trigger='導入契約で確定', category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'EMANATION' AND service_menus.name = 'DX・AI導入';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, ref_trigger, sort)
SELECT s.id, 'DX・AI導入', 'referral', 'fixed', 40000, '導入契約で確定', 0
FROM services s WHERE s.name = 'EMANATION'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = 'DX・AI導入');

-- ── ENTERSOLOGY LIVE ─────────────────────────────────────────────────────────
INSERT INTO services (name, subtitle, icon, color, active, sort, coop_enabled)
SELECT 'ENTERSOLOGY LIVE', '配信クリエイタープラットフォーム', 'mic', '#ec4899', true, 6, false
WHERE NOT EXISTS (SELECT 1 FROM services WHERE name = 'ENTERSOLOGY LIVE');

UPDATE services SET
  icon='mic', color='#ec4899', sort=6,
  coop_enabled=false, coop_rate=null, coop_base=null
WHERE name = 'ENTERSOLOGY LIVE';

UPDATE service_menus SET ref_type='rate', ref_value=10, ref_base='受取収入', ref_trigger='所属クリエイター収入発生時', category='referral'
FROM services WHERE service_menus.service_id = services.id AND services.name = 'ENTERSOLOGY LIVE' AND service_menus.name = '配信クリエイター所属';

INSERT INTO service_menus (service_id, name, category, ref_type, ref_value, ref_base, ref_trigger, sort)
SELECT s.id, '配信クリエイター所属', 'referral', 'rate', 10, '受取収入', '所属クリエイター収入発生時', 0
FROM services s WHERE s.name = 'ENTERSOLOGY LIVE'
  AND NOT EXISTS (SELECT 1 FROM service_menus m WHERE m.service_id = s.id AND m.name = '配信クリエイター所属');
