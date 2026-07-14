/** P2 モバイル機械計測（375×667）: サプライヤー案件ドロワー（エビデンス節込み最長）・money頁の横溢れ。残置ゼロ。 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcEm!2026xx', SUP = 'cc-em-sup@mb-system.internal'
let pass = 0, fail = 0; const ok = (c: boolean, n: string, d = '') => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, d)) }
async function cleanup() {
  const { data: ds } = await admin.from('deals').select('id').like('customer_name', 'CCEM%')
  for (const d of ds ?? []) {
    const { data: files } = await admin.storage.from('deal-evidence').list(d.id)
    if (files?.length) await admin.storage.from('deal-evidence').remove(files.map(f => `${d.id}/${f.name}`)).catch(() => {})
    await admin.from('deal_evidences').delete().eq('deal_id', d.id); await admin.from('deal_events').delete().eq('deal_id', d.id)
    await admin.from('deal_items').delete().eq('deal_id', d.id); await admin.from('deals').delete().eq('id', d.id)
  }
  const { data: svc } = await admin.from('services').select('id').eq('name', 'CC-EMブランド').maybeSingle()
  if (svc) { const { data: sms } = await admin.from('service_menus').select('id').eq('service_id', svc.id); if (sms?.length) await admin.from('service_menus').delete().in('id', sms.map(x => x.id)); await admin.from('services').delete().eq('id', svc.id) }
  const { data: l } = await admin.auth.admin.listUsers()
  const u = (l?.users || []).find((x: any) => x.email === SUP)
  if (u) { const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle(); if (pa) await admin.from('partners').delete().eq('id', pa.id); await admin.from('audit_logs').delete().eq('actor_profile_id', u.id).then(() => {}, () => {}); await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}) }
  await admin.from('audit_logs').delete().like('actor_name', '%CC-EM%').then(() => {}, () => {})
}
await cleanup()
const c = await admin.auth.admin.createUser({ email: SUP, password: PW, email_confirm: true })
await admin.from('profiles').upsert({ id: c.data!.user!.id, name: 'CC-EM供給者', role: 'partner', email: SUP, color: '#888' })
const supPid = (await admin.from('partners').insert({ profile_id: c.data!.user!.id, code: 'CCEM01', company_name: '株式会社CC-EM' }).select('id').single()).data!.id
const svcId = (await admin.from('services').insert({ name: 'CC-EMブランド', active: true, supplier_partner_id: supPid, icon: '🧪', color: '#4733E6' }).select('id').single()).data!.id
const smId = (await admin.from('service_menus').insert({ service_id: svcId, name: 'CC-EMメニュー', ref_type: 'fixed', ref_value: 10000 }).select('id').single()).data!.id
const sysPid = (await admin.from('partners').select('id').eq('is_system', true).limit(1)).data![0].id
const dealId = (await admin.from('deals').insert({ partner_id: sysPid, service_id: svcId, menu_id: smId, customer_name: 'CCEM案件', channel: 'cooperation', source: 'partner_form', consent: true, status: 'confirmed', fixed_month: '2026-07-01' }).select('id').single()).data!.id
await admin.from('deal_items').insert({ deal_id: dealId, service_id: svcId, menu_id: smId, kind: 'fixed', amount: 0, revenue: null, sort: 0 })
// 最長コンテンツ: エビデンス2件を事前投入
writeFileSync('/tmp/ccem.pdf', '%PDF-1.4 mobile\n%%EOF')
for (const label of ['契約書.pdf', '請求書.pdf']) {
  const path = `${dealId}/${crypto.randomUUID()}-m.pdf`
  await admin.storage.from('deal-evidence').upload(path, readFileSync('/tmp/ccem.pdf'), { contentType: 'application/pdf' })
  await admin.from('deal_evidences').insert({ deal_id: dealId, uploaded_by_partner_id: supPid, path, label })
}

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
await login(p, SUP, '/app')
await p.goto(BASE + '/app/s/deals', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2500)
ok(await p.evaluate('document.documentElement.scrollWidth <= 375') as boolean, '案件(375px) 横溢れなし')
await p.locator('.sup-list tr:has-text("CCEM案件")').first().click(); await p.waitForTimeout(1200)
const drawer = p.locator('.exp-in')
ok((await p.locator('.exp-in >> text=エビデンス（任意）').count()) > 0, 'ドロワーにエビデンス節')
ok((await p.locator('.exp-in button:has-text("開く")').count()) === 2, '添付2件（最長コンテンツ）表示')
const attach = await p.locator('.exp-in button:has-text("＋ 契約書・請求書を添付")').boundingBox()
ok(!!attach && attach.height >= 24 && attach.width <= 375, '添付ボタン可視・タップ可', JSON.stringify(attach))
// ドロワー内で最下部までスクロール到達（受注額入力＋エビデンス＋委託の全節）
const reach = await p.evaluate(`(() => { const m = document.querySelector('.exp-in'); if (!m) return false; m.scrollTop = 99999; return m.scrollHeight - m.scrollTop - m.clientHeight < 2 })()`) as boolean
ok(reach, 'ドロワー最下部まで到達')
ok(await p.evaluate(`document.querySelector('.exp-in').getBoundingClientRect().width <= 375`) as boolean, 'ドロワー幅 375px 内')
// money 頁（📎行を含むレイアウト）
await p.goto(BASE + '/app/s/money', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(2200)
ok(await p.evaluate('document.documentElement.scrollWidth <= 375') as boolean, 'money(375px) 横溢れなし')
ok(errs.length === 0, 'page errors []', errs.join(' | '))
await b.close(); await cleanup()
const left = (await admin.from('deals').select('id').like('customer_name', 'CCEM%')).data?.length ?? 0
ok(left === 0, '残置ゼロ')
console.log(`\n== p2 mobile check: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
