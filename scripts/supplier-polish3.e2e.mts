/**
 * 3点微修正 E2E — ①ゲージ新色トークン（琥珀と非混同）②保存バー位置PC/SP機械計測 ③ログアウト=設定末尾。残置ゼロ。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcP3!2026xx'
const SUP = 'cc-p3-sup@mb-system.internal', OWNER = 'cc-p3-owner@mb-system.internal'
const SHOT = '/private/tmp/claude-501/-Users-kmbrkthk/3c01494a-a62a-4e0d-b895-09f7cc0f5b0c/scratchpad'
let pass = 0, fail = 0; const ok = (c: boolean, n: string, d = '') => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, d)) }
const NEW = 'rgb(242, 151, 27)'   // --gauge-deduction #F2971B

async function cleanup() {
  const { data: ds } = await admin.from('deals').select('id').like('customer_name', 'CCP3%')
  for (const d of ds ?? []) { await admin.from('deal_items').delete().eq('deal_id', d.id); await admin.from('deals').delete().eq('id', d.id) }
  const { data: svc } = await admin.from('services').select('id').eq('name', 'CC-P3ブランド').maybeSingle()
  if (svc) {
    const { data: sms } = await admin.from('service_menus').select('id').eq('service_id', svc.id)
    if (sms?.length) {
      const { data: ms } = await admin.from('menus').select('id').in('service_menu_id', sms.map(x => x.id))
      if (ms?.length) { await admin.from('menu_rewards').delete().in('menu_id', ms.map(x => x.id)); await admin.from('menus').delete().in('id', ms.map(x => x.id)) }
      await admin.from('service_menus').delete().in('id', sms.map(x => x.id))
    }
    await admin.from('services').delete().eq('id', svc.id)
  }
  const { data: l } = await admin.auth.admin.listUsers()
  for (const em of [SUP, OWNER]) {
    const u = (l?.users || []).find((x: any) => x.email === em)
    if (u) { const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle(); if (pa) await admin.from('partners').delete().eq('id', pa.id); await admin.from('audit_logs').delete().eq('actor_profile_id', u.id).then(() => {}, () => {}); await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}) }
  }
}
await cleanup()
const mk = async (email: string, name: string, role: string) => { const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } }); await admin.from('profiles').upsert({ id: c.data!.user!.id, name, role, email, color: '#888' }); return c.data!.user!.id }
await mk(OWNER, 'CC-P3運営', 'owner')
const supUid = await mk(SUP, 'CC-P3供給者', 'partner')
const supPid = (await admin.from('partners').insert({ profile_id: supUid, code: 'CCP301', company_name: '株式会社CC-P3', status: 'active' }).select('id').single()).data!.id
const svcId = (await admin.from('services').insert({ name: 'CC-P3ブランド', active: true, supplier_partner_id: supPid, icon: '🧪', color: '#4733E6' }).select('id').single()).data!.id
const smId = (await admin.from('service_menus').insert({ service_id: svcId, name: 'CC-P3メニュー', ref_type: 'fixed', ref_value: 0 }).select('id').single()).data!.id
await admin.from('menus').insert({ service_menu_id: smId, name: 'CC-P3メニュー', active: true })
const sysPid = (await admin.from('partners').select('id').eq('is_system', true).limit(1)).data![0].id
const ym = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
const dealId = (await admin.from('deals').insert({ partner_id: sysPid, service_id: svcId, customer_name: 'CCP3案件', channel: 'cooperation', source: 'partner_form', consent: true, status: 'confirmed', amount: 50000, fixed_month: `${ym}-01`, fee_snapshot: { menu_supplier_partner_id: supPid, rate_kind: 'half_commission', rate: 0.5 } }).select('id').single()).data!.id
await admin.from('deal_items').insert({ deal_id: dealId, service_id: svcId, kind: 'fixed', amount: 0, revenue: 400000, sort: 0 })

const b = await chromium.launch()
const errs: string[] = []
async function login(p: Page, email: string, path: string) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  if (!(await p.locator('input[type="email"]').count())) return
  await p.locator('input[type="email"]').fill(email); await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(2800)
}
const barColors = (p: Page) => p.evaluate(`[...document.querySelectorAll('.bar-grow')].map(el => getComputedStyle(el).backgroundColor)`) as Promise<string[]>

console.log('① ゲージ新色')
const sctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const sp = await sctx.newPage(); sp.on('pageerror', e => errs.push(sp.url() + ': ' + e.message))
await login(sp, SUP, '/app'); await sp.waitForTimeout(2500)
const homeBars = await barColors(sp)
ok(homeBars.includes(NEW), 'サプライヤーダッシュボード: MB手数料バー=新色 #F2971B', JSON.stringify(homeBars))
await sp.screenshot({ path: SHOT + '/polish3-supplier-home-gauge.png' })
await sp.goto(BASE + '/app/s/money', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(2200)
ok((await barColors(sp)).includes(NEW), 'お金: MB手数料バー=新色')
const octx = await b.newContext({ viewport: { width: 1440, height: 900 } })
const op = await octx.newPage(); op.on('pageerror', e => errs.push(op.url() + ': ' + e.message))
await login(op, OWNER, '/console'); await op.waitForTimeout(3500)
const mbBars = await barColors(op)
ok(mbBars.includes(NEW), 'MBダッシュボード: 委託費/経費バー=新色', JSON.stringify(mbBars))
ok(!mbBars.includes('rgb(192, 122, 18)'), 'MBダッシュボードのゲージに旧amberなし')
await op.screenshot({ path: SHOT + '/polish3-mb-dashboard-gauge.png' })
// 琥珀（注意系）の非混同: 乖離フラグは旧amberのまま（console deals GET APIレベルで確認済みの機構・UI色定義をソースで担保）
console.log('② 保存バー位置（PC/SP機械計測）')
await sp.goto(BASE + '/app/s/products', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(2200)
await sp.locator('text=CC-P3ブランド').first().click(); await sp.waitForTimeout(1200)
const drawerBox = (await sp.locator('.prod-drawer').boundingBox())!
const barBtn = await sp.locator('button:has-text("変更を申請")').boundingBox()
ok(!!barBtn && Math.abs((barBtn.y + barBtn.height) - (drawerBox.y + drawerBox.height)) < 26, 'PC: 保存バーがドロワー下端に固定', JSON.stringify({ barBtn, dBottom: drawerBox.y + drawerBox.height }))
// 最長コンテンツ（メニュー面）でスクロールしてもバー位置不変
await sp.locator('.prod-lnav button:has-text("CC-P3メニュー")').click(); await sp.waitForTimeout(1200)
await sp.evaluate(`(() => { const sc = [...document.querySelectorAll('.prod-drawer div')].find(d => d.scrollHeight > d.clientHeight + 40 && getComputedStyle(d).overflowY === 'auto'); if (sc) sc.scrollTop = 99999 })()`)
await sp.waitForTimeout(400)
const barBtn2 = await sp.locator('button:has-text("変更を申請")').boundingBox()
ok(!!barBtn2 && Math.abs((barBtn2.y + barBtn2.height) - (drawerBox.y + drawerBox.height)) < 26, 'PC: 最長コンテンツをスクロールしてもバー固定', JSON.stringify(barBtn2))
await sp.screenshot({ path: SHOT + '/polish3-products-savebar.png' })
// SP 375
const mctx = await b.newContext({ viewport: { width: 375, height: 667 } })
const mp = await mctx.newPage(); mp.on('pageerror', e => errs.push(mp.url() + ': ' + e.message))
await login(mp, SUP, '/app')
await mp.goto(BASE + '/app/s/products', { waitUntil: 'domcontentloaded' }); await mp.waitForTimeout(2000)
await mp.locator('text=CC-P3ブランド').first().click(); await mp.waitForTimeout(1200)
const mFooter = await mp.evaluate(`(() => { const f = document.querySelector('.prod-drawer').children[1].lastElementChild; const r = f.getBoundingClientRect(); return { b: Math.round(r.bottom), h: Math.round(r.height) } })()`) as { b: number; h: number }
ok(mFooter.b >= 665 && mFooter.b <= 669 && mFooter.h <= 80, 'SP: 保存バーが画面下端に固定・1行高（ヒントはSP非表示）', JSON.stringify(mFooter))
const mBar = await mp.locator('button:has-text("変更を申請")').boundingBox()
ok(!!mBar && mBar.y + mBar.height <= 667 + 2 && mBar.y + mBar.height >= 667 - 60, 'SP: 申請ボタン可視・下端付近', JSON.stringify(mBar))
ok(await mp.evaluate('document.documentElement.scrollWidth <= 375') as boolean, 'SP: 横溢れなし')

console.log('③ ログアウト=設定末尾')
ok((await sp.locator('.sup-side button:has-text("ログアウト")').count()) === 0, 'サイドバーから撤去')
await sp.goto(BASE + '/app/s/settings', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(2000)
const lo = sp.locator('button:has-text("ログアウト")')
ok((await lo.count()) === 1, '設定ページにログアウト')
const isLast = await sp.evaluate(`(() => { const btns = [...document.querySelectorAll('main button')].filter(b => b.offsetParent); const last = btns[btns.length - 1]; return last && last.textContent.includes('ログアウト') })()`) as boolean
ok(isLast, '設定の末尾に配置（mainの最後の操作要素）')
await lo.click(); await sp.waitForTimeout(2500)
ok(new URL(sp.url()).pathname === '/login' && (await sp.locator('input[type="email"]').count()) === 1, 'ログアウト→ログイン画面着地')

ok(errs.length === 0, 'page errors []', errs.join(' | ').slice(0, 300))
await b.close()
await cleanup()
const left = (await admin.from('services').select('id').eq('name', 'CC-P3ブランド')).data?.length ?? 0
ok(left === 0, '残置ゼロ')
console.log(`\n== supplier-polish3 E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
