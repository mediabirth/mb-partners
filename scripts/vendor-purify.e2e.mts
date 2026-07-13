/**
 * ベンダー純化P1 E2E — 完全自走検証（残置ゼロ・実データ非接触・CC_MAIL_SUPPRESS=1 サーバ前提）。
 *  A) 納品宣言の移管: console書き手（ドロワー→確認→delivered→deal_events）→凍結→支払の一気通貫
 *  B) 納品宣言の移管: サプライヤー書き手（/app/s/deals ドロワー→確認→delivered→deal_events）
 *  C) vendor純化: 承諾1タップ維持／deliver UI不在／PM残滓UI・API(405×5)／schedule→ホームredirect
 *  D) 委託先招待の分岐質問（既定=パートナー・いいえ→委託先招待が機能）
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcVp!2026xx'
const OWNER = 'cc-vp-owner@mb-system.internal', SUP = 'cc-vp-sup@mb-system.internal', VEND = 'cc-vp-vend@mb-system.internal'
let pass = 0, fail = 0; const ok = (c: boolean, n: string, d = '') => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, d)) }

async function cleanup() {
  await admin.from('deal_events').delete().like('body', '%CC-VP%')
  const { data: ds } = await admin.from('deals').select('id').like('customer_name', 'CCVP%')
  for (const d of ds ?? []) {
    await admin.from('deal_events').delete().eq('deal_id', d.id)
    await admin.from('delivery_payout_items').delete().eq('deal_id', d.id)
    await admin.from('delivery_assignments').delete().eq('deal_id', d.id)
    await admin.from('deal_items').delete().eq('deal_id', d.id)
    await admin.from('deals').delete().eq('id', d.id)
  }
  const { data: dlv } = await admin.from('deliveries').select('id').like('name', 'CC-VP%')
  for (const v of dlv ?? []) { await admin.from('delivery_payout_items').delete().eq('delivery_id', v.id); await admin.from('delivery_assignments').delete().eq('delivery_id', v.id); await admin.from('invites').delete().eq('delivery_id', v.id); await admin.from('deliveries').delete().eq('id', v.id) }
  const { data: svc } = await admin.from('services').select('id').eq('name', 'CC-VPブランド').maybeSingle()
  if (svc) { await admin.from('services').delete().eq('id', svc.id) }
  const { data: l } = await admin.auth.admin.listUsers()
  for (const em of [VEND, SUP, OWNER]) {
    const u = (l?.users || []).find((x: any) => x.email === em)
    if (u) {
      const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle()
      if (pa) { await admin.from('invites').delete().eq('frontier_id', pa.id).then(() => {}, () => {}); await admin.from('partners').delete().eq('id', pa.id) }
      await admin.from('audit_logs').delete().eq('actor_profile_id', u.id).then(() => {}, () => {})
      await admin.from('profiles').delete().eq('id', u.id)
      await admin.auth.admin.deleteUser(u.id).catch(() => {})
    }
    await admin.from('invites').delete().eq('email', em)
  }
  await admin.from('audit_logs').delete().like('actor_name', '%CC-VP%').then(() => {}, () => {})
}

await cleanup()
// ── フィクスチャ（service_roleで直接・全てCC-VP/CCVP接頭辞＝台帳不要の自動撤去） ──
const mk = async (email: string, name: string, role: string) => {
  const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } })
  await admin.from('profiles').upsert({ id: c.data!.user!.id, name, role, email, color: '#888' })
  return c.data!.user!.id
}
const ownerId = await mk(OWNER, 'CC-VP運営', 'owner')
const supUid = await mk(SUP, 'CC-VP供給者', 'partner')
const vendUid = await mk(VEND, 'CC-VP受託者', 'partner')
const { data: supPa } = await admin.from('partners').insert({ profile_id: supUid, code: 'CCVP01', company_name: '株式会社CC-VP検証' }).select('id').single()
const supPid = supPa!.id
const { data: svcIns } = await admin.from('services').insert({ name: 'CC-VPブランド', active: true, supplier_partner_id: supPid, icon: '🧪', color: '#4733E6' }).select('id').single()
const svcId = svcIns!.id
// 委託先2つ: MB直（console書き手経路・vendorログイン先）／サプライヤー所有（supplier書き手経路）
const { data: dvMb } = await admin.from('deliveries').insert({ name: 'CC-VP委託先MB', active: true, auth_user_id: vendUid }).select('id').single()
const { data: dvSup } = await admin.from('deliveries').insert({ name: 'CC-VP委託先SUP', active: true, supplier_partner_id: supPid }).select('id').single()
const sysPid = (await admin.from('partners').select('id').eq('is_system', true).limit(1)).data![0].id
const mkDeal = async (cust: string) => (await admin.from('deals').insert({ partner_id: sysPid, service_id: svcId, customer_name: cust, channel: 'cooperation', source: 'partner_form', consent: true, status: 'confirmed', fixed_month: '2026-07-01' }).select('id').single()).data!.id
const dealA = await mkDeal('CCVP案件A')
const dealB = await mkDeal('CCVP案件B')
const asgA = (await admin.from('delivery_assignments').insert({ deal_id: dealA, delivery_id: dvMb!.id, base_fee: 30000, status: 'accepted' }).select('id').single()).data!.id
const asgB = (await admin.from('delivery_assignments').insert({ deal_id: dealB, delivery_id: dvSup!.id, base_fee: 45000, status: 'accepted' }).select('id').single()).data!.id
const asgC = (await admin.from('delivery_assignments').insert({ deal_id: dealB, delivery_id: dvMb!.id, base_fee: 5000, status: 'proposed' }).select('id').single()).data!.id

const b = await chromium.launch()
const errs: string[] = []
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
ctx.on('page', p => { p.on('pageerror', e => errs.push(p.url() + ': ' + e.message)) })
const pg = await ctx.newPage()
pg.on('pageerror', e => errs.push(pg.url() + ': ' + e.message))
async function login(p: Page, email: string, path: string) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  if (!(await p.locator('input[type="email"]').count())) return
  await p.locator('input[type="email"]').fill(email); await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(2800)
}

// ── A) console書き手: ドロワー→納品済みにする→確認→delivered→deal_events→凍結→支払 ──
console.log('A) console書き手（納品宣言→凍結→支払）')
await login(pg, OWNER, '/console')
await pg.goto(BASE + '/console/deals', { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(3000)
await pg.locator('text=CCVP案件A').first().click(); await pg.waitForTimeout(1500)
const dlvBtn = pg.locator('button', { hasText: '納品済みにする' })
ok(await dlvBtn.count() > 0, 'ドロワーに「納品済みにする」表示（了承済の委託行）')
await dlvBtn.first().click(); await pg.waitForTimeout(600)
ok((await pg.locator('text=経費の申請ができるようになります').count()) > 0, '確認＝ripple文法（結果予告文）')
await pg.locator('.modal-pop button', { hasText: '納品済みにする' }).click(); await pg.waitForTimeout(2500)
{
  const { data } = await admin.from('delivery_assignments').select('status').eq('id', asgA).single()
  ok(data?.status === 'delivered', 'console書き手で accepted→delivered')
  const { data: ev } = await admin.from('deal_events').select('body, created_by').eq('deal_id', dealA)
  const hit = (ev ?? []).find(e => (e.body ?? '').includes('納品済みにしました'))
  ok(!!hit && hit.created_by === ownerId, 'deal_events に宣言者（運営）と記録', JSON.stringify(ev))
  ok(!!hit && (hit.body ?? '').includes('CC-VP委託先MB'), 'deal_events に委託先名')
}
// 凍結→支払（delivery_payout_items・moneyフロー不変の実証）
const frz = await pg.request.post(BASE + '/api/console/delivery-payouts', { data: { delivery_id: dvMb!.id, period: '2026-07' } })
ok(frz.ok(), '月次凍結 POST ok')
const { data: poi } = await admin.from('delivery_payout_items').select('id, amount, status').eq('deal_id', dealA)
ok((poi ?? []).length === 1 && poi![0].amount === 30000 && poi![0].status === 'unpaid', '凍結明細（¥30,000・unpaid）生成', JSON.stringify(poi))
const paid = await pg.request.patch(BASE + `/api/console/delivery-payouts/${poi![0].id}`, { data: { paid: true } })
ok(paid.ok(), '支払済みへ PATCH ok')
const { data: poi2 } = await admin.from('delivery_payout_items').select('status, paid_at').eq('id', poi![0].id).single()
ok(poi2?.status === 'paid' && !!poi2?.paid_at, '一気通貫: delivered→凍結→paid 完了')

// ── B) サプライヤー書き手 ──
console.log('B) サプライヤー書き手（納品宣言）')
const sp = await ctx.newPage()
await login(sp, SUP, '/app')
await sp.goto(BASE + '/app/s/deals', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(3000)
await sp.locator('text=CCVP案件B').first().click(); await sp.waitForTimeout(1200)
const spBtn = sp.locator('button', { hasText: '納品済みにする' })
ok(await spBtn.count() === 1, '自社委託先の了承済行のみボタン表示（MB直proposed行には出ない）', String(await spBtn.count()))
await spBtn.first().click(); await sp.waitForTimeout(500)
ok((await sp.locator('text=経費の申請ができるようになります').count()) > 0, 'サプライヤー側も確認＝ripple文法')
await sp.locator('.modal-pop button', { hasText: '納品済みにする' }).click(); await sp.waitForTimeout(2500)
{
  const { data } = await admin.from('delivery_assignments').select('status').eq('id', asgB).single()
  ok(data?.status === 'delivered', 'サプライヤー書き手で accepted→delivered')
  const { data: ev } = await admin.from('deal_events').select('body').eq('deal_id', dealB)
  ok((ev ?? []).some(e => (e.body ?? '').includes('サプライヤー') && (e.body ?? '').includes('納品済みにしました')), 'deal_events に宣言者（サプライヤー）')
}
// 境界: 他人の委託（MB直 asgC を supplier セッションで）→ 403
const forb = await sp.request.post(BASE + '/api/supplier/self', { data: { kind: 'deliver', assignment_id: asgC } })
ok(forb.status() === 403, '自社委託先以外の deliver は 403', String(forb.status()))

// ── C) vendor 純化（承諾1タップ維持・deliver不在・PM残滓405・schedule redirect） ──
console.log('C) vendor 3機能純化')
const vp = await ctx.newPage()
await login(vp, VEND, '/vendor')
ok(vp.url().includes('/vendor'), 'vendor ログイン到達')
// schedule → ホームへリダイレクト（404にしない）
await vp.goto(BASE + '/vendor/schedule', { waitUntil: 'domcontentloaded' }); await vp.waitForTimeout(1200)
ok(new URL(vp.url()).pathname === '/vendor', '/vendor/schedule → /vendor リダイレクト', vp.url())
ok((await vp.locator('[aria-label="予定"]').count()) === 0, 'ナビに「予定」不在')
ok((await vp.locator('[aria-label="経費を申請"]').count()) > 0, 'ナビ中央=経費を申請（3機能の主動作）')
// 承諾（1タップ・合意証跡＝本人操作）は健在
await vp.goto(BASE + `/vendor/cases/${asgC}`, { waitUntil: 'domcontentloaded' }); await vp.waitForTimeout(1500)
await vp.locator('button', { hasText: '受ける' }).first().click(); await vp.waitForTimeout(2000)
{
  const { data } = await admin.from('delivery_assignments').select('status').eq('id', asgC).single()
  ok(data?.status === 'accepted', 'vendor 承諾（1タップ）は不変で機能')
}
// 了承済の案件詳細に「納品済みにする」が無い（rendered走査）
await vp.goto(BASE + `/vendor/cases/${asgC}`, { waitUntil: 'domcontentloaded' }); await vp.waitForTimeout(1200)
const body = await vp.evaluate('document.body.innerText') as string
ok(!body.includes('納品済みにする'), 'vendor 案件詳細に納品宣言UI不在')
ok(body.includes('納品の確認は発注元が行います'), '経費ゲートの案内文（発注元が確認）')
// PM残滓 API 5本=405、deliver=405
const api = async (method: string, path: string, data?: object) => (await vp.request.fetch(BASE + path, { method, data })).status()
ok(await api('PATCH', `/api/vendor/assignments/${asgC}`, { action: 'deliver' }) === 405, 'vendor deliver は 405')
ok(await api('POST', '/api/vendor/schedule', {}) === 405, 'schedule API 405')
ok(await api('POST', '/api/vendor/updates', {}) === 405, 'updates API 405')
ok(await api('POST', '/api/vendor/deliverables', {}) === 405, 'deliverables API 405')
ok(await api('PATCH', '/api/vendor/tasks/x', {}) === 405, 'tasks API 405')
ok(await api('GET', '/api/vendor/deliverables/x/file') === 405, 'deliverables file API 405')
// 明細閲覧（機能②）: 委託費と経費ブロックが見える
ok(body.includes('委託費') && body.includes('経費'), '明細閲覧（委託費・経費）健在')

// ── D) 委託先招待の分岐質問 ──
console.log('D) 招待分岐（既定=パートナー）')
await sp.goto(BASE + '/app/s/partners', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(2500)
await sp.locator('button', { hasText: '委託先を招待' }).first().click(); await sp.waitForTimeout(800)
ok((await sp.locator('text=営業・紹介もする方ですか').count()) > 0, '分岐質問の表示')
ok((await sp.locator('text=「パートナー」としてお迎えください').count()) > 0, '既定=パートナー側（高さん向け説明文）')
ok((await sp.locator('input[placeholder*="山田保険"]').count()) === 0, '既定では委託先フィールド非表示')
await sp.locator('button', { hasText: 'いいえ（実務のみ）' }).click(); await sp.waitForTimeout(400)
await sp.locator('input[placeholder*="山田保険"]').fill('CC-VP分岐検証所')
await sp.locator('.modal-pop button', { hasText: '招待リンクを作成' }).click(); await sp.waitForTimeout(2500)
// 招待URLは readonly input の value（innerText には出ない）
const inviteUrl = await sp.locator('.modal-pop input[readonly]').first().inputValue().catch(() => '')
ok(inviteUrl.includes('/invite/'), '「いいえ」→委託先招待リンク発行', inviteUrl)
{
  const { data } = await admin.from('deliveries').select('id, supplier_partner_id').eq('name', 'CC-VP分岐検証所').maybeSingle()
  ok(!!data && data.supplier_partner_id === supPid, '委託先が自社所有で作成')
}

ok(errs.length === 0, `page errors []`, errs.join(' | '))
await b.close()
await cleanup()
// 撤去確認（残置ゼロ）
const left = [
  (await admin.from('deals').select('id').like('customer_name', 'CCVP%')).data?.length ?? 0,
  (await admin.from('deliveries').select('id').like('name', 'CC-VP%')).data?.length ?? 0,
  (await admin.from('services').select('id').eq('name', 'CC-VPブランド')).data?.length ?? 0,
]
ok(left.every(x => x === 0), '残置ゼロ（teardown完了）', JSON.stringify(left))
console.log(`\n== vendor-purify E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
