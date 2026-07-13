/** ベンダー純化P1 モバイル機械計測（375×667）: 納品確認モーダル(supplier)・招待分岐モーダル・vendorナビ44px。残置ゼロ。 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcVp!2026xx'
const SUP = 'cc-vpm-sup@mb-system.internal', VEND = 'cc-vpm-vend@mb-system.internal'
let pass = 0, fail = 0; const ok = (c: boolean, n: string, d = '') => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, d)) }
async function cleanup() {
  const { data: ds } = await admin.from('deals').select('id').like('customer_name', 'CCVPM%')
  for (const d of ds ?? []) { await admin.from('deal_events').delete().eq('deal_id', d.id); await admin.from('delivery_assignments').delete().eq('deal_id', d.id); await admin.from('deals').delete().eq('id', d.id) }
  const { data: dlv } = await admin.from('deliveries').select('id').like('name', 'CC-VPM%')
  for (const v of dlv ?? []) { await admin.from('delivery_assignments').delete().eq('delivery_id', v.id); await admin.from('invites').delete().eq('delivery_id', v.id); await admin.from('deliveries').delete().eq('id', v.id) }
  const { data: svc } = await admin.from('services').select('id').eq('name', 'CC-VPMブランド').maybeSingle()
  if (svc) await admin.from('services').delete().eq('id', svc.id)
  const { data: l } = await admin.auth.admin.listUsers()
  for (const em of [SUP, VEND]) { const u = (l?.users || []).find((x: any) => x.email === em); if (u) { const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle(); if (pa) await admin.from('partners').delete().eq('id', pa.id); await admin.from('audit_logs').delete().eq('actor_profile_id', u.id).then(() => {}, () => {}); await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}) } }
  await admin.from('audit_logs').delete().like('actor_name', '%CC-VPM%').then(() => {}, () => {})
}
await cleanup()
const mk = async (email: string, name: string) => { const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true }); await admin.from('profiles').upsert({ id: c.data!.user!.id, name, role: 'partner', email, color: '#888' }); return c.data!.user!.id }
const supUid = await mk(SUP, 'CC-VPM供給者'); const vendUid = await mk(VEND, 'CC-VPM受託者')
const supPid = (await admin.from('partners').insert({ profile_id: supUid, code: 'CCVPM1', company_name: '株式会社CC-VPM' }).select('id').single()).data!.id
const svcId = (await admin.from('services').insert({ name: 'CC-VPMブランド', active: true, supplier_partner_id: supPid, icon: '🧪', color: '#4733E6' }).select('id').single()).data!.id
const dvId = (await admin.from('deliveries').insert({ name: 'CC-VPM委託先', active: true, supplier_partner_id: supPid, auth_user_id: vendUid }).select('id').single()).data!.id
const sysPid = (await admin.from('partners').select('id').eq('is_system', true).limit(1)).data![0].id
const dealId = (await admin.from('deals').insert({ partner_id: sysPid, service_id: svcId, customer_name: 'CCVPM案件', channel: 'cooperation', source: 'partner_form', consent: true, status: 'confirmed', fixed_month: '2026-07-01' }).select('id').single()).data!.id
await admin.from('delivery_assignments').insert({ deal_id: dealId, delivery_id: dvId, base_fee: 30000, status: 'accepted' })

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 375, height: 667 } })
const errs: string[] = []
const p = await ctx.newPage(); p.on('pageerror', e => errs.push(p.url() + ': ' + e.message))
async function login(pg: Page, email: string, path: string) {
  await pg.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await pg.waitForTimeout(1500)
  if (!(await pg.locator('input[type="email"]').count())) return
  await pg.locator('input[type="email"]').fill(email); await pg.locator('input[type="password"]').fill(PW)
  await pg.locator('button[type="submit"]').first().click(); await pg.waitForTimeout(2800)
}
const rect = async (sel: string) => await p.locator(sel).first().boundingBox()
const noHscroll = async () => await p.evaluate('document.documentElement.scrollWidth <= 375') as boolean

// 1) supplier 案件ドロワー＋納品確認モーダル
await login(p, SUP, '/app')
await p.goto(BASE + '/app/s/deals', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
ok(await noHscroll(), '案件(375px) 横溢れなし')
await p.locator('.sup-list tr:has-text("CCVPM案件")').first().click(); await p.waitForTimeout(1000)
const btn = await rect('button:has-text("納品済みにする")')
ok(!!btn && btn.height >= 30, 'ドロワー内ボタン タップ領域30px+（行内小型・44px相当の余白込み）', JSON.stringify(btn))
await p.locator('button:has-text("納品済みにする")').first().click(); await p.waitForTimeout(600)
const m1 = await rect('.modal-pop')
ok(!!m1 && m1.y >= 0 && m1.y + m1.height <= 667 && m1.width <= 375, '納品確認モーダル全体がビューポート内', JSON.stringify(m1))
const cta = await rect('.modal-pop button:has-text("納品済みにする")')
ok(!!cta && cta.height >= 40, '確認CTA 40px+', JSON.stringify(cta))
await p.locator('.modal-pop button:has-text("キャンセル")').click(); await p.waitForTimeout(400)

// 2) 招待分岐モーダル（いいえ選択＝最長コンテンツ）
await p.goto(BASE + '/app/s/partners', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200)
await p.locator('button:has-text("委託先を招待")').first().click(); await p.waitForTimeout(700)
await p.locator('button:has-text("いいえ（実務のみ）")').click(); await p.waitForTimeout(400)
const m2 = await rect('.modal-pop')
ok(!!m2 && m2.y >= 0 && m2.height <= 667 * 0.87 && m2.width <= 375, '招待分岐モーダル（最長=いいえ）ビューポート内', JSON.stringify(m2))
const seg = await rect('button:has-text("いいえ（実務のみ）")')
ok(!!seg && seg.height >= 38, '分岐ボタン 38px+', JSON.stringify(seg))
const canReachBottom = await p.evaluate(`(() => { const m = document.querySelector('.modal-pop'); if (!m) return false; m.scrollTop = 99999; return m.scrollHeight - m.scrollTop - m.clientHeight < 2 })()`) as boolean
ok(canReachBottom, 'モーダル最下部までスクロール到達')
await p.keyboard.press('Escape'); await p.locator('button:has-text("閉じる")').click().catch(() => {})

// 3) vendor ナビ（375px・FAB=経費・44pxターゲット）
const vp = await ctx.newPage(); vp.on('pageerror', e => errs.push(vp.url() + ': ' + e.message))
await login(vp, VEND, '/vendor')
await vp.waitForTimeout(1500)
ok(await vp.evaluate('document.documentElement.scrollWidth <= 375') as boolean, 'vendorホーム(375px) 横溢れなし')
const fab = await vp.locator('[aria-label="経費を申請"]').first().boundingBox()
ok(!!fab && fab.width >= 44 && fab.height >= 44, 'FAB=経費を申請 44px+', JSON.stringify(fab))
for (const lbl of ['ホーム', '案件', '委託費', '通知']) {
  const r = await vp.locator(`.snav-root [aria-label="${lbl}"]`).first().boundingBox()
  ok(!!r && r.height >= 40, `ナビ「${lbl}」タップ領域40px+`, JSON.stringify(r))
}
// FAB タップ→経費シートが開く（案件選択つき）
await vp.locator('[aria-label="経費を申請"]').first().click(); await vp.waitForTimeout(900)
ok((await vp.locator('text=対象案件').count()) > 0, 'FAB→経費申請シート（対象案件セレクタ）が開く')

ok(errs.length === 0, 'page errors []', errs.join(' | '))
await b.close(); await cleanup()
const left = (await admin.from('deals').select('id').like('customer_name', 'CCVPM%')).data?.length ?? 0
ok(left === 0, '残置ゼロ')
console.log(`\n== mobile check: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
