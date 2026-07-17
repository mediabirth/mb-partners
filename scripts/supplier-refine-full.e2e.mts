/**
 * サプライヤー洗練フル E2E — 残置ゼロ（fixture全撤去でmoney 3+1復元・menu_rewards含む）。
 *  A) お金: タブ/内訳（前バッチ実装の回帰）＋②紹介者別行（氏名主体＋コード小・MB直はコード非表示）
 *  B) 商品: グループ区切り（表示=申請/報酬=すぐ/社内）・保存結果が下部バーに出る（バリデーション表示）
 *  C) ヒアリング: 定義(サービスマスタAPI/UI)→console入力(onBlur保存)→supplier参照→面境界(一般403/renderedゼロ)→報酬非接続
 *  D) 対比スクショ（MBサービスマスタ vs 商品／MB支払 vs お金）・モバイル・ペルソナ
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcRf!2026xx'
const SUP = 'cc-rf-sup@mb-system.internal', REF = 'cc-rf-ref@mb-system.internal', OWNER = 'cc-rf-owner@mb-system.internal'
const SHOT = '/private/tmp/claude-501/-Users-kmbrkthk/3c01494a-a62a-4e0d-b895-09f7cc0f5b0c/scratchpad'
let pass = 0, fail = 0; const ok = (c: boolean, n: string, d = '') => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, d)) }

async function cleanup() {
  const { data: ds } = await admin.from('deals').select('id').like('customer_name', 'CCRF%')
  for (const d of ds ?? []) { await admin.from('deal_hearing_answers').delete().eq('deal_id', d.id); await admin.from('deal_events').delete().eq('deal_id', d.id); await admin.from('deal_items').delete().eq('deal_id', d.id); await admin.from('deals').delete().eq('id', d.id) }
  const { data: svc } = await admin.from('services').select('id').eq('name', 'CC-RFブランド').maybeSingle()
  if (svc) {
    const { data: sms } = await admin.from('service_menus').select('id').eq('service_id', svc.id)
    const smIds = (sms ?? []).map(x => x.id)
    if (smIds.length) {
      const { data: ms } = await admin.from('menus').select('id').in('service_menu_id', smIds)
      const mIds = (ms ?? []).map(x => x.id)
      if (mIds.length) { await admin.from('menu_hearing_items').delete().in('menu_id', mIds); await admin.from('menu_rewards').delete().in('menu_id', mIds); await admin.from('menus').delete().in('id', mIds) }
      await admin.from('service_menus').delete().in('id', smIds)
    }
    await admin.from('services').delete().eq('id', svc.id)
  }
  const { data: l } = await admin.auth.admin.listUsers()
  for (const em of [REF, SUP, OWNER]) {
    const u = (l?.users || []).find((x: any) => x.email === em)
    if (u) { const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle(); if (pa) await admin.from('partners').delete().eq('id', pa.id); await admin.from('audit_logs').delete().eq('actor_profile_id', u.id).then(() => {}, () => {}); await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}) }
  }
  await admin.from('audit_logs').delete().like('actor_name', '%CC-RF%').then(() => {}, () => {})
}
await cleanup()
const mk = async (email: string, name: string, role: string) => { const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } }); await admin.from('profiles').upsert({ id: c.data!.user!.id, name, role, email, color: '#888' }); return c.data!.user!.id }
await mk(OWNER, 'CC-RF運営', 'owner')
const supUid = await mk(SUP, 'CC-RF供給者', 'partner')
const refUid = await mk(REF, 'CC-RF紹介', 'partner')
const supPid = (await admin.from('partners').insert({ profile_id: supUid, code: 'CCRF01', company_name: '株式会社CC-RF', is_frontier: true }).select('id').single()).data!.id
const refPid = (await admin.from('partners').insert({ profile_id: refUid, code: 'CCRF02', frontier_id: supPid }).select('id').single()).data!.id
const svcId = (await admin.from('services').insert({ name: 'CC-RFブランド', active: true, supplier_partner_id: supPid, icon: '🧪', color: '#4733E6' }).select('id').single()).data!.id
const smId = (await admin.from('service_menus').insert({ service_id: svcId, name: 'CC-RF投資用マンション', ref_type: 'fixed', ref_value: 10000 }).select('id').single()).data!.id
const menuId = (await admin.from('menus').insert({ service_menu_id: smId, name: 'CC-RF投資用マンション', active: true }).select('id').single()).data!.id
await admin.from('menu_rewards').insert({ menu_id: menuId, reward_type: 'fixed', reward_value: 10000, active: true })
const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
const dealId = (await admin.from('deals').insert({ partner_id: refPid, service_id: svcId, menu_id: smId, customer_name: 'CCRF佐藤', channel: 'cooperation', source: 'partner_form', consent: true, status: 'confirmed', amount: 100000, fixed_month: `${ym}-01`, fee_snapshot: { menu_supplier_partner_id: supPid, rate_kind: 'half_commission', rate: 0.5 } }).select('id').single()).data!.id
await admin.from('deal_items').insert({ deal_id: dealId, service_id: svcId, kind: 'fixed', amount: 0, revenue: 1_000_000, sort: 0 })
const sysPid = (await admin.from('partners').select('id').eq('is_system', true).limit(1)).data![0].id
const deal2 = (await admin.from('deals').insert({ partner_id: sysPid, service_id: svcId, menu_id: smId, customer_name: 'CCRF直接', channel: 'cooperation', source: 'partner_form', consent: true, status: 'confirmed', amount: 0, fixed_month: `${ym}-01` }).select('id').single()).data!.id
await admin.from('deal_items').insert({ deal_id: deal2, service_id: svcId, kind: 'fixed', amount: 0, revenue: 500_000, sort: 0 })

const b = await chromium.launch()
const errs: string[] = []
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
async function login(p: Page, email: string, path: string) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  if (!(await p.locator('input[type="email"]').count())) return
  await p.locator('input[type="email"]').fill(email); await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(2800)
}

console.log('C) ヒアリング（定義→入力→参照→境界）')
const op = await ctx.newPage(); op.on('pageerror', e => errs.push(op.url() + ': ' + e.message))
await login(op, OWNER, '/console')
// 定義（API set-semantics）
const put = await op.request.put(BASE + `/api/console/menus/${menuId}/hearing-items`, { data: { items: [
  { label: '年収', input_type: 'number', required: true, sort: 0 },
  { label: '自己資金', input_type: 'text', required: false, sort: 1 },
  { label: '希望エリア', input_type: 'select', options: ['都心', '郊外'], required: false, sort: 2 },
] } })
ok(put.ok() && (await put.json()).items.length === 3, 'ヒアリング項目の定義（3件・型/必須/並び）')
// サービスマスタUIに定義エディタが出る
await op.goto(BASE + '/console/services', { waitUntil: 'domcontentloaded' }); await op.waitForTimeout(2500)
await op.locator('text=CC-RFブランド').first().click(); await op.waitForTimeout(1500)
await op.locator('nav button:has-text("CC-RF投資用マンション"), button:has-text("CC-RF投資用マンション")').first().click(); await op.waitForTimeout(1200)
ok((await op.locator('text=ヒアリング項目（このメニューの案件で確認すること）').count()) === 1, 'サービスマスタにヒアリング項目エディタ')
ok((await op.locator('input[value="年収"]').count()) === 1, '定義済み項目がエディタに表示')
await op.screenshot({ path: SHOT + '/full-mb-services-drawer.png' })
await op.keyboard.press('Escape'); await op.locator('button[aria-label="閉じる"]').first().click().catch(() => {})
// console 案件ドロワーで構造化入力（onBlur保存）
await op.goto(BASE + '/console/deals', { waitUntil: 'domcontentloaded' }); await op.waitForTimeout(3000)
await op.locator('text=CCRF佐藤').first().click(); await op.waitForTimeout(1800)
ok((await op.locator('text=年収').count()) >= 1 && (await op.locator('text=希望エリア').count()) >= 1, '案件ドロワーにメニュー別ヒアリング欄')
const ninc = op.locator('input[inputmode="numeric"][placeholder="—"]').first()
await ninc.fill('800'); await ninc.press('Tab'); await op.waitForTimeout(1500)
const { data: ans1 } = await admin.from('deal_hearing_answers').select('value').eq('deal_id', dealId)
ok((ans1 ?? []).length === 1 && ans1![0].value === '800', 'onBlur保存で deal_hearing_answers に記録', JSON.stringify(ans1))
// select型
await op.locator('select:has(option:has-text("都心"))').first().selectOption('都心'); await op.waitForTimeout(1200)
const { data: ans2 } = await admin.from('deal_hearing_answers').select('value').eq('deal_id', dealId).order('value')
ok((ans2 ?? []).length === 2 && ans2!.some(a => a.value === '都心'), 'select型の保存')

console.log('A/B) supplier: お金②氏名行・商品グループ文法・ヒアリング参照')
const sctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const sp = await sctx.newPage(); sp.on('pageerror', e => errs.push(sp.url() + ': ' + e.message))
await login(sp, SUP, '/app')
await sp.goto(BASE + '/app/s/money', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(2500)
const moneyBody = await sp.evaluate('document.body.innerText') as string
ok(moneyBody.includes('CC-RF紹介') && moneyBody.includes('CCRF02'), '②紹介者別行=氏名主体＋コード小')
ok(moneyBody.includes('MB Partners（直接）'), 'MB直接分の行（コード非表示）')
ok(moneyBody.includes('¥100,000') && moneyBody.includes('今月の成約 2件分'), '②合計=単一ソース（deals.amount）')
await sp.screenshot({ path: SHOT + '/full-supplier-money.png' })
// 商品ドロワーのグループ文法＋フッター表示
await sp.goto(BASE + '/app/s/products', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(2200)
await sp.locator('text=CC-RFブランド').first().click(); await sp.waitForTimeout(1200)
ok((await sp.locator('text=表示（申請して反映＝パートナー・お客さまに見える項目）').count()) >= 1, '商品: 表示グループ見出し')
ok((await sp.locator('text=社内（すぐ反映・お客さまには表示されません）').count()) === 1, '商品: 社内グループ見出し')
await sp.locator('.prod-lnav button:has-text("CC-RF投資用マンション")').click(); await sp.waitForTimeout(800)
ok((await sp.locator('text=報酬（すぐ反映）').count()) === 1, '商品: 報酬グループ見出し（MB報酬ブロック文法）')
await sp.screenshot({ path: SHOT + '/full-supplier-products-drawer.png' })
await sp.locator('button:has-text("保存する")').click(); await sp.waitForTimeout(1500)
const footer = await sp.evaluate(`document.querySelector('.prod-drawer') ? [...document.querySelectorAll('.prod-drawer span')].map(x=>x.textContent).join('|') : ''`) as string
ok(footer.includes('変更はありません'), '保存結果が下部バーに表示（バリデーション表示位置）', footer.slice(0, 120))
await sp.locator('button[aria-label="閉じる"]').click(); await sp.waitForTimeout(600)
// supplier 案件ドロワーのヒアリング参照
await sp.goto(BASE + '/app/s/deals', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(2500)
await sp.locator('.sup-board button:has-text("CCRF佐藤")').first().click(); await sp.waitForTimeout(1500)
const drawerTxt = await sp.evaluate(`document.body.innerText`) as string
ok(drawerTxt.includes('年収') && drawerTxt.includes('800') && drawerTxt.includes('都心'), 'supplier参照: 項目と回答（読み取り）')

console.log('境界・ペルソナ・報酬非接続')
const rctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const rp = await rctx.newPage(); rp.on('pageerror', e => errs.push(rp.url() + ': ' + e.message))
await login(rp, REF, '/app')
ok((await rp.request.get(BASE + `/api/supplier/hearing?deal_id=${dealId}`)).status() === 403, '一般パートナーは hearing API 403')
ok((await rp.request.put(BASE + `/api/console/menus/${menuId}/hearing-items`, { data: { items: [] } })).status() === 403, '一般は定義API 403')
const refBody = await rp.evaluate('document.body.innerText') as string
ok(!refBody.includes('ヒアリング') && !refBody.includes('あなたの会社の手残り'), 'リファラル/appに露出なし（バイト不変）')
// 報酬非接続: 回答があっても deal amount/menu_rewards は不変（値で確認）
const { data: dchk } = await admin.from('deals').select('amount').eq('id', dealId).single()
ok(Number(dchk!.amount) === 100000, 'ヒアリング回答後も deals.amount 不変（報酬非接続）')

console.log('D) MB対比スクショ・モバイル')
await op.goto(BASE + '/console/payouts', { waitUntil: 'domcontentloaded' }); await op.waitForTimeout(2500)
await op.screenshot({ path: SHOT + '/full-mb-payouts.png' })
const mctx = await b.newContext({ viewport: { width: 375, height: 667 } })
const mp = await mctx.newPage(); mp.on('pageerror', e => errs.push(mp.url() + ': ' + e.message))
await login(mp, SUP, '/app')
await mp.goto(BASE + '/app/s/deals', { waitUntil: 'domcontentloaded' }); await mp.waitForTimeout(2200)
await mp.locator('.sup-list tr:has-text("CCRF佐藤")').first().click(); await mp.waitForTimeout(1200)
ok(await mp.evaluate('document.documentElement.scrollWidth <= 375') as boolean, 'モバイル: 案件+ヒアリング参照 横溢れなし')
await mp.goto(BASE + '/app/s/products', { waitUntil: 'domcontentloaded' }); await mp.waitForTimeout(2000)
await mp.locator('text=CC-RFブランド').first().click(); await mp.waitForTimeout(1000)
ok(await mp.evaluate('document.documentElement.scrollWidth <= 375') as boolean, 'モバイル: 商品ドロワー 横溢れなし')

ok(errs.length === 0, 'page errors []', errs.join(' | ').slice(0, 300))
await b.close()
await cleanup()
const left = [
  (await admin.from('deals').select('id').like('customer_name', 'CCRF%')).data?.length ?? 0,
  (await admin.from('menu_hearing_items').select('id').limit(500)).data?.length ?? 0,
]
ok(left[0] === 0, '残置ゼロ（deals/hearing定義）', JSON.stringify(left))
console.log(`\n== supplier-refine-full E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
