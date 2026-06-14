/**
 * Pre-migration COUNT verification
 * Run: npx tsx scripts/count-before-migration.ts
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  const c = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
  for (const l of c.split('\n')) {
    const i = l.indexOf('='); if (i < 1) continue
    const key = l.slice(0, i).trim(); let val = l.slice(i + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
    if (!process.env[key]) process.env[key] = val
  }
}
loadEnv()

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const DELETE_SERVICE_IDS = ['2996bcaf-e009-4bfa-a39e-ddbafe4a05e0', 'cad8793a-99ab-4769-8014-d9e52c6a5706', 'apitest', '2c378393-f339-4427-bd89-4002024ec68e']
const DELETE_MENU_IDS = [
  'c0000001-0000-0000-0000-000000000000', // moom 賃貸紹介 (BUG rate=30000)
  'adf3e241-c46d-452b-ba6f-9c0cd077ab15', // moom 賃貸成約(紹介)
  'c0000002-0000-0000-0000-000000000000', // mh 紹介(つなぐだけ)
  'c9b4fc73-81fe-4e14-b815-2910f774d8d1', // mh 転職入社(紹介)
  'c0000003-0000-0000-0000-000000000000', // mh 採用企業開拓(営業まで)
  'c0000008-0000-0000-0000-000000000000', // dx 紹介(つなぐだけ)
  'df32b3b1-9995-44c1-b6d1-4044b061ef29', // PRAGMATION DX・AI導入
  'df123935-06e8-4764-b76d-b2711cee0275', // EMANATION DX・AI導入
  '477b0db3-4a1b-473c-9fdd-90e8e078f4c2', // reso 撮影紹介
  '6b002f10-53a5-4bdb-8901-d3597611877a', // reso ロゴ
  '461b72c6-1f96-4889-9efb-256da12426bb', // reso 開発紹介
  'c0000009-0000-0000-0000-000000000000', // live クリエイター紹介
  '072f76c0-50af-4821-ae57-fd269e4bec61', // live 配信クリエイター紹介
  '7a2f30ee-183c-4a12-8d2e-2a1b2678a6ff', // テスト 撮影
  'e2d1018a-5686-4b52-84b7-39f4b12e82ed', // テスト 撮影
]
const TEST_DEAL_IDS = [
  'd0000001-0000-0000-0000-000000000000',
  'd0000002-0000-0000-0000-000000000000',
  'd0000003-0000-0000-0000-000000000000',
  'd0000004-0000-0000-0000-000000000000',
  'd0000005-0000-0000-0000-000000000000',
  'd0000006-0000-0000-0000-000000000000',
  'd0000007-0000-0000-0000-000000000000',
  'd0000008-0000-0000-0000-000000000000',
]

async function main() {
  console.log('=== PRE-MIGRATION COUNT VERIFICATION ===\n')

  // 1. Test deals
  const { data: testDeals } = await svc.from('deals').select('id,customer_name,service_id,menu_id,channel,status').in('id', TEST_DEAL_IDS)
  console.log(`[A2] 削除対象テスト案件: ${testDeals?.length ?? 0}件`)
  testDeals?.forEach(d => console.log(`  - ${d.id.slice(0,8)} ${d.customer_name} svc=${d.service_id} menu=${d.menu_id ?? 'null'} status=${d.status}`))

  // 1b. deal_events for test deals
  const { count: testEventsCount } = await svc.from('deal_events').select('id', { count: 'exact', head: true }).in('deal_id', TEST_DEAL_IDS)
  console.log(`[A2] 削除対象deal_events: ${testEventsCount ?? 0}件`)

  // 2. KEPT deals referencing services to be deleted
  console.log('\n[Guard B] 残すdeal → 削除サービス参照確認:')
  const { data: svcRefDeals } = await svc.from('deals').select('id,customer_name,service_id,menu_id').in('service_id', DELETE_SERVICE_IDS).not('id', 'in', `(${TEST_DEAL_IDS.join(',')})`)
  if (!svcRefDeals?.length) {
    console.log('  ✓ 0df09568 中村DX以外なし')
  } else {
    svcRefDeals.forEach(d => console.log(`  ! ${d.id.slice(0,8)} ${d.customer_name} svc=${d.service_id} → dx付け替え必要`))
  }
  console.log(`  付け替え対象: ${svcRefDeals?.length ?? 0}件`)

  // 3. KEPT deals referencing menus to be deleted
  console.log('\n[Guard B] 残すdeal → 削除メニュー参照確認:')
  const { data: menuRefDeals } = await svc.from('deals').select('id,customer_name,menu_id').in('menu_id', DELETE_MENU_IDS).not('id', 'in', `(${TEST_DEAL_IDS.join(',')})`)
  if (!menuRefDeals?.length) {
    console.log('  ✓ 残すdealの削除メニュー参照なし')
  } else {
    menuRefDeals.forEach(d => console.log(`  ! ${d.id.slice(0,8)} ${d.customer_name} menu=${d.menu_id}`))
  }

  // 4. referral_links to delete
  console.log('\n[A4] 削除対象referral_links:')
  const APITEST_PARTNER_ID = 'efb12def-1e3a-4cc6-8d7b-4148aa057728'
  const ZZ8354_PARTNER_ID  = 'c211d2da-d8fb-46ac-9b53-1421259789cf'
  // Delete APITEST's links + ZZ8354's links (referral_links only, not the ZZ8354 partner itself)
  const { data: rl } = await svc.from('referral_links').select('id,partner_id,service_id').in('partner_id', [APITEST_PARTNER_ID, ZZ8354_PARTNER_ID])
  rl?.forEach(r => console.log(`  - ${r.id.slice(0,8)} partner=${r.partner_id === APITEST_PARTNER_ID ? 'APITEST' : 'ZZ8354'} svc=${r.service_id}`))
  console.log(`  合計: ${rl?.length ?? 0}件`)

  // Also delete referral_links referencing services to be deleted (from any partner)
  const { data: svcRl } = await svc.from('referral_links').select('id,partner_id,service_id').in('service_id', DELETE_SERVICE_IDS).not('partner_id', 'in', `(${APITEST_PARTNER_ID},${ZZ8354_PARTNER_ID})`)
  if (svcRl?.length) {
    console.log('  ! 他パートナーの削除サービスlinks:')
    svcRl.forEach(r => console.log(`    - ${r.id.slice(0,8)} partner=${r.partner_id} svc=${r.service_id}`))
  }

  // 5. Partners to delete (APITEST only)
  console.log('\n[A5] 削除対象partner+profile:')
  const { data: apiPartner } = await svc.from('partners').select('id,code,profile_id').eq('id', APITEST_PARTNER_ID)
  apiPartner?.forEach(p => console.log(`  - partner: ${p.code} (${p.id})`))
  const testProfileIds = ['092c97d5-398c-4d9e-b580-efaac3e11582', 'e04a2e64-e5e0-4370-a06a-66c51db496a8'] // TestPartner + TestAdmin
  const { data: testProfs } = await svc.from('profiles').select('id,name,email,role').in('id', testProfileIds)
  testProfs?.forEach(p => console.log(`  - profile: ${p.name} (${p.email}) role=${p.role}`))

  // 6. Service menus count
  const { count: menuCount } = await svc.from('service_menus').select('id', { count: 'exact', head: true }).in('id', DELETE_MENU_IDS)
  console.log(`\n[A6] 削除対象service_menus: ${menuCount ?? 0}件 (期待値: ${DELETE_MENU_IDS.length}件)`)

  // 7. Services count
  const { count: svcCount } = await svc.from('services').select('id', { count: 'exact', head: true }).in('id', DELETE_SERVICE_IDS)
  console.log(`[A7] 削除対象services: ${svcCount ?? 0}件 (期待値: ${DELETE_SERVICE_IDS.length}件)`)

  // 8. deal_events to check/backfill
  console.log('\n[Guard C] deal_events body確認 (enum生文字列含むもの):')
  const { data: rawBodyEvents } = await svc.from('deal_events').select('id,deal_id,body,created_at').or('body.like.%received%,body.like.%in_progress%,body.like.%confirmed%,body.like.%paid%').not('deal_id', 'in', `(${TEST_DEAL_IDS.join(',')})`)
  if (!rawBodyEvents?.length) {
    console.log('  ✓ enum生文字列を含むeventなし')
  } else {
    rawBodyEvents.forEach(e => console.log(`  ! ${e.id.slice(0,8)} deal=${e.deal_id.slice(0,8)} body="${e.body}"`))
    console.log(`  バックフィル対象: ${rawBodyEvents.length}件`)
  }

  console.log('\n=== COUNT SUMMARY ===')
  console.log(`テスト案件削除:      ${testDeals?.length ?? 0}件`)
  console.log(`deal_events削除:     ${testEventsCount ?? 0}件`)
  console.log(`service付け替え:     ${svcRefDeals?.length ?? 0}件`)
  console.log(`referral_links削除:  ${(rl?.length ?? 0) + (svcRl?.length ?? 0)}件`)
  console.log(`partners削除:        ${apiPartner?.length ?? 0}件(APITEST)`)
  console.log(`profiles削除:        ${testProfs?.length ?? 0}件`)
  console.log(`service_menus削除:   ${menuCount ?? 0}件`)
  console.log(`services削除:        ${svcCount ?? 0}件`)
}
main().catch(console.error)
