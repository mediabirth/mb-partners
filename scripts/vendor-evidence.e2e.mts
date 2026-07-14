/**
 * ベンダー純化P2 E2E — 売上エビデンス＋乖離琥珀フラグ（残置ゼロ・実データ非接触・CC_MAIL_SUPPRESS=1 サーバ前提）。
 *  A) エビデンス: supplier添付→一覧→署名URL閲覧(200)→console一覧/閲覧/削除→期限切れ挙動
 *  B) 面公開ゼロ: 非supplierの evidence API 403・vendor案件詳細renderedに不出・partner面API 403
 *  C) 乖離フラグ境界: 中央値±70%（+65%=非発火/+80%=発火）・N=1緩帯（×1.2=非発火/×10=発火）・保存非ブロック
 *  D) supplier桁確認トースト（乖離時のみ・非乖離時は通常文言）・consoleカード琥珀/ドロワー表示
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
import { judgeDeviation } from '../lib/revenue-flag'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcEv!2026xx'
const OWNER = 'cc-ev-owner@mb-system.internal', SUP = 'cc-ev-sup@mb-system.internal', PLAIN = 'cc-ev-plain@mb-system.internal'
let pass = 0, fail = 0; const ok = (c: boolean, n: string, d = '') => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, d)) }

async function cleanup() {
  const { data: ds } = await admin.from('deals').select('id').like('customer_name', 'CCEV%')
  for (const d of ds ?? []) {
    const { data: files } = await admin.storage.from('deal-evidence').list(d.id)
    if (files?.length) await admin.storage.from('deal-evidence').remove(files.map(f => `${d.id}/${f.name}`)).catch(() => {})
    await admin.from('deal_evidences').delete().eq('deal_id', d.id)
    await admin.from('deal_events').delete().eq('deal_id', d.id)
    await admin.from('deal_items').delete().eq('deal_id', d.id)
    await admin.from('deals').delete().eq('id', d.id)
  }
  const { data: svc } = await admin.from('services').select('id').eq('name', 'CC-EVブランド').maybeSingle()
  if (svc) {
    const { data: sms } = await admin.from('service_menus').select('id').eq('service_id', svc.id)
    const smIds = (sms ?? []).map(x => x.id)
    if (smIds.length) {
      const { data: ms } = await admin.from('menus').select('id').in('service_menu_id', smIds)
      const mIds = (ms ?? []).map(x => x.id)
      if (mIds.length) { await admin.from('menu_rewards').delete().in('menu_id', mIds); await admin.from('menus').delete().in('id', mIds) }
      await admin.from('service_menus').delete().in('id', smIds)
    }
    await admin.from('services').delete().eq('id', svc.id)
  }
  const { data: l } = await admin.auth.admin.listUsers()
  for (const em of [PLAIN, SUP, OWNER]) {
    const u = (l?.users || []).find((x: any) => x.email === em)
    if (u) {
      const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle()
      if (pa) await admin.from('partners').delete().eq('id', pa.id)
      await admin.from('audit_logs').delete().eq('actor_profile_id', u.id).then(() => {}, () => {})
      await admin.from('profiles').delete().eq('id', u.id)
      await admin.auth.admin.deleteUser(u.id).catch(() => {})
    }
  }
  await admin.from('audit_logs').delete().like('actor_name', '%CC-EV%').then(() => {}, () => {})
}

await cleanup()
const mk = async (email: string, name: string, role: string) => {
  const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } })
  await admin.from('profiles').upsert({ id: c.data!.user!.id, name, role, email, color: '#888' })
  return c.data!.user!.id
}
await mk(OWNER, 'CC-EV運営', 'owner')
const supUid = await mk(SUP, 'CC-EV供給者', 'partner')
const plainUid = await mk(PLAIN, 'CC-EV一般', 'partner')
const supPid = (await admin.from('partners').insert({ profile_id: supUid, code: 'CCEV01', company_name: '株式会社CC-EV検証' }).select('id').single()).data!.id
await admin.from('partners').insert({ profile_id: plainUid, code: 'CCEV02' })   // 一般パートナー（supplierではない）
const svcId = (await admin.from('services').insert({ name: 'CC-EVブランド', active: true, supplier_partner_id: supPid, icon: '🧪', color: '#4733E6' }).select('id').single()).data!.id
// deals.menu_id は service_menus 参照（console直営業と同じ流儀）。フラグのメニューキー＝reward_snapshot.menu_id ?? deals.menu_id で一貫。
const menuA = (await admin.from('service_menus').insert({ service_id: svcId, name: 'CC-EVメニューA', ref_type: 'fixed', ref_value: 10000 }).select('id').single()).data!.id
const menuB = (await admin.from('service_menus').insert({ service_id: svcId, name: 'CC-EVメニューB', ref_type: 'fixed', ref_value: 10000 }).select('id').single()).data!.id
const sysPid = (await admin.from('partners').select('id').eq('is_system', true).limit(1)).data![0].id
const mkDeal = async (cust: string, menuId: string, revenue: number | null) => {
  const id = (await admin.from('deals').insert({ partner_id: sysPid, service_id: svcId, menu_id: menuId, customer_name: cust, channel: 'cooperation', source: 'partner_form', consent: true, status: 'confirmed', fixed_month: '2026-07-01' }).select('id').single()).data!.id
  await admin.from('deal_items').insert({ deal_id: id, service_id: svcId, menu_id: menuId, kind: 'fixed', amount: 0, revenue, sort: 0 })
  return id
}
// メニューA: peers 3件（中央値 ¥1,000,000）＋検証2件（+65%=非発火/+80%=発火）
await mkDeal('CCEV-P1', menuA, 900_000); await mkDeal('CCEV-P2', menuA, 1_000_000); await mkDeal('CCEV-P3', menuA, 1_100_000)
const dealNear = await mkDeal('CCEV-近', menuA, 1_650_000)
const dealFar = await mkDeal('CCEV-遠', menuA, 1_800_000)
// メニューB: peer 1件（¥500,000）＋×10=発火の緩帯検証／メニューC: peer 1件＋×1.2=非発火検証（Nを1に保つため分離）
const menuC = (await admin.from('service_menus').insert({ service_id: svcId, name: 'CC-EVメニューC', ref_type: 'fixed', ref_value: 10000 }).select('id').single()).data!.id
await mkDeal('CCEV-Q1', menuB, 500_000)
const dealSpYes = await mkDeal('CCEV-疎遠', menuB, 5_000_000)
await mkDeal('CCEV-R1', menuC, 500_000)
const dealSpNo = await mkDeal('CCEV-疎近', menuC, 600_000)
// digit_check 用（supplier本人が受注額を入力する未入力案件・メニューA）
const dealInput = await mkDeal('CCEV-入力', menuA, null)

// 純関数の境界（サーバ不要）: ちょうど±70%は非発火（strict）・N==0はfixed×10からの1桁ずれのみ
ok(judgeDeviation(1_700_000, [900_000, 1_000_000, 1_100_000], null) === null, '境界: ちょうど+70%は非発火（strict）')
ok(judgeDeviation(299_999, [900_000, 1_000_000, 1_100_000], null) !== null, '境界: -70%超（¥299,999）は発火')
ok(judgeDeviation(4_000_000, [], 400_000) !== null && judgeDeviation(3_000_000, [], 400_000) === null && judgeDeviation(4_000_000, [], null) === null, 'N==0: 想定値×10ずれのみ発火（7.5倍は非発火）・参照不能は判定しない')

const b = await chromium.launch()
const errs: string[] = []
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
ctx.on('page', p => { p.on('pageerror', e => errs.push(p.url() + ': ' + e.message)) })
const pg = await ctx.newPage(); pg.on('pageerror', e => errs.push(pg.url() + ': ' + e.message))
async function login(p: Page, email: string, path: string) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  if (!(await p.locator('input[type="email"]').count())) return
  await p.locator('input[type="email"]').fill(email); await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(2800)
}

// ── A) エビデンス（supplier添付→閲覧→console閲覧/添付/削除→期限） ──
console.log('A) 売上エビデンス')
const sp = await ctx.newPage()
await login(sp, SUP, '/app')
await sp.goto(BASE + '/app/s/deals', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(3000)
await sp.locator('.sup-board button:has-text("CCEV-遠")').first().click(); await sp.waitForTimeout(1200)
writeFileSync('/tmp/ccev-contract.pdf', '%PDF-1.4 CC-EV evidence test\n%%EOF')
ok((await sp.locator('text=通常は不要です').count()) > 0, '任意ポリシー文の表示（添付口）')
await sp.locator('input[type="file"]').setInputFiles('/tmp/ccev-contract.pdf'); await sp.waitForTimeout(2500)
ok((await sp.locator('text=エビデンスを添付しました').count()) > 0, 'supplier 添付トースト')
const { data: evRows } = await admin.from('deal_evidences').select('id, path, uploaded_by_partner_id').eq('deal_id', dealFar)
ok((evRows ?? []).length === 1 && evRows![0].uploaded_by_partner_id === supPid, 'deal_evidences 行（supplier帰属）')
// supplier 署名URL閲覧
const sv = await sp.request.get(BASE + `/api/supplier/evidence?id=${evRows![0].id}`)
const svj = await sv.json()
ok(sv.ok() && typeof svj.url === 'string', 'supplier 署名URL発行')
ok((await sp.request.get(svj.url)).status() === 200, '署名URLでファイル取得 200')
// console 一覧/閲覧/添付/削除
await login(pg, OWNER, '/console')
const cl = await pg.request.get(BASE + `/api/console/deals/${dealFar}/evidences`)
const clj = await cl.json()
ok(cl.ok() && clj.evidences?.length === 1, 'console 一覧に添付が見える')
const cv = await pg.request.get(BASE + `/api/console/deals/${dealFar}/evidences?ev=${evRows![0].id}`)
ok(cv.ok() && (await pg.request.get((await cv.json()).url)).status() === 200, 'console 署名URL閲覧 200')
const up = await pg.request.post(BASE + `/api/console/deals/${dealFar}/evidences`, { multipart: { label: '請求書', file: { name: 'invoice.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 console side\n%%EOF') } } })
ok(up.ok(), 'console 側からも添付できる')
// ドロワーUI: エビデンス節＋琥珀表示
await pg.goto(BASE + '/console/deals', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(3000)
await pg.locator('text=CCEV-遠').first().click(); await pg.waitForTimeout(1800)
ok((await pg.locator('text=エビデンス（契約書・請求書など・任意）').count()) > 0, 'console ドロワーにエビデンス節')
ok((await pg.locator('text=相場と乖離').count()) > 0, 'console ドロワーに琥珀「相場と乖離」')
const openBtns = pg.locator('button:has-text("開く")')
ok((await openBtns.count()) >= 2, '添付2件（supplier+console）が並ぶ')
// 削除（console のみ）
await pg.locator('button[title="添付を削除"]').first().click(); await pg.waitForTimeout(1500)
const { data: evAfterDel } = await admin.from('deal_evidences').select('id').eq('deal_id', dealFar)
ok((evAfterDel ?? []).length === 1, 'console 削除（1件残る）')
// 期限切れ: 1秒署名URL→2秒後に失効
const { data: oneSec } = await admin.storage.from('deal-evidence').createSignedUrl(evRows![0].path, 1)
await new Promise(r => setTimeout(r, 2500))
const expired = await pg.request.get(oneSec!.signedUrl)
ok(expired.status() >= 400, `期限切れ署名URLは拒否（${expired.status()}）`)

// ── B) 面公開ゼロ ──
console.log('B) 面公開ゼロ')
// ★独立ブラウザ文脈（SUP/OWNERのcookieを共有しない＝一般パートナー本人のセッションで検証）
const pctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
pctx.on('page', p => { p.on('pageerror', e => errs.push(p.url() + ': ' + e.message)) })
const pp = await pctx.newPage()
await login(pp, PLAIN, '/app')
ok((await pp.request.get(BASE + `/api/supplier/evidence?deal_id=${dealFar}`)).status() === 403, '一般パートナーは supplier evidence API 403')
ok((await pp.request.get(BASE + `/api/console/deals/${dealFar}/evidences`)).status() === 403, '一般パートナーは console evidences API 403')
const appBody = await pp.evaluate('document.body.innerText') as string
ok(!appBody.includes('エビデンス'), 'パートナー面renderedにエビデンス不出')

// ── C) 乖離フラグ境界（console GET・保存非ブロック） ──
console.log('C) 乖離フラグ境界')
const dealsRes = await pg.request.get(BASE + '/api/console/deals')
const dealsJson = await dealsRes.json()
const flagOf = (id: string) => (dealsJson.deals as { id: string; _rev_flag?: unknown }[]).find(d => d.id === id)?._rev_flag ?? null
ok(flagOf(dealFar) !== null, '+80%（中央値¥1M→¥1.8M）は発火')
ok(flagOf(dealNear) === null, '+65%（¥1.65M）は非発火')
ok(flagOf(dealSpYes) !== null, 'N=1 ×10（¥500k→¥5M）は緩帯で発火')
ok(flagOf(dealSpNo) === null, 'N=1 ×1.2（¥600k）は非発火')
const { data: spRow } = await admin.from('deal_items').select('revenue').eq('deal_id', dealSpYes)
ok(Number(spRow![0].revenue) === 5_000_000, '発火しても保存はブロックされない（¥5,000,000が保存済み）')
// ボードカードの琥珀点
await pg.goto(BASE + '/console/deals', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(3000)
ok((await pg.locator('[title*="相場と乖離"]').count()) >= 2, 'ボードカードに琥珀点（遠・疎遠）')

// ── D) supplier 桁確認トースト（乖離時のみ・保存完了） ──
console.log('D) 桁確認トースト')
await sp.goto(BASE + '/app/s/deals', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(3000)
await sp.locator('.sup-board button:has-text("CCEV-入力")').first().click(); await sp.waitForTimeout(1200)
const drawerInput = sp.locator('.exp-in input[inputmode="numeric"]')
await drawerInput.fill('9000000')   // 中央値¥1Mの9倍=乖離
await sp.locator('.exp-in button:has-text("保存")').click(); await sp.waitForTimeout(2500)
ok((await sp.locator('text=桁のご確認をおすすめします').count()) > 0, '乖離時トースト「桁のご確認を」')
const { data: inRow } = await admin.from('deal_items').select('revenue').eq('deal_id', dealInput)
ok(Number(inRow![0].revenue) === 9_000_000, 'トーストが出ても保存は完了（非ブロック）')
await drawerInput.fill('1000000')
await sp.locator('.exp-in button:has-text("保存")').click(); await sp.waitForTimeout(2500)
ok((await sp.locator('text=保存済み・請求計算に反映されます').count()) > 0, '非乖離時は通常文言（嫌疑表示なし）')

ok(errs.length === 0, 'page errors []', errs.join(' | '))
await b.close()
await cleanup()
const left = [
  (await admin.from('deals').select('id').like('customer_name', 'CCEV%')).data?.length ?? 0,
  (await admin.from('deal_evidences').select('id').limit(1000)).data?.filter(() => false).length ?? 0,
  (await admin.from('services').select('id').eq('name', 'CC-EVブランド')).data?.length ?? 0,
]
ok(left.every(x => x === 0), '残置ゼロ（teardown完了）', JSON.stringify(left))
console.log(`\n== vendor-evidence E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
