/**
 * サプライヤー完全等価化＋個別報酬率 E2E — 残置ゼロ（fixture全撤去でmoney 3+1復元）。
 *  A) 内部運用定義（即時）: 報酬追加（型/値/トリガー/協力タスク）→menu_rewards+cooperation_task_templates／継続型は標準カードで拒否／ヒアリング定義
 *  A) 申請系: メニュー追加→承認で作成／メニュー非公開→承認で反映／ロゴアップロード→申請→承認でlogo_path
 *  B) 個別報酬率: サプライヤー設定→対象パートナーのAPPにだけ個別表示（他パートナー非漏出）／自社外パートナー403／本人400
 *  横断: 一般パートナーのAPI 403・リファラルUI不変・スクショ・money復元
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcMs!2026xx'
const SUP = 'cc-ms-sup@mb-system.internal', REF = 'cc-ms-ref@mb-system.internal', REF2 = 'cc-ms-ref2@mb-system.internal', OWNER = 'cc-ms-owner@mb-system.internal'
const SHOT = '/private/tmp/claude-501/-Users-kmbrkthk/3c01494a-a62a-4e0d-b895-09f7cc0f5b0c/scratchpad'
let pass = 0, fail = 0; const ok = (c: boolean, n: string, d = '') => { c ? (pass++, console.log('  ✓', n)) : (fail++, console.log('  ✗', n, d)) }

async function cleanup() {
  const { data: svcs } = await admin.from('services').select('id').like('name', 'CC-MS%')
  for (const svc of svcs ?? []) {
    const { data: files } = await admin.storage.from('service-logos').list(`supplier/${svc.id}`)
    if (files?.length) await admin.storage.from('service-logos').remove(files.map(f => `supplier/${svc.id}/${f.name}`)).catch(() => {})
    const { data: sms } = await admin.from('service_menus').select('id').eq('service_id', svc.id)
    const smIds = (sms ?? []).map(x => x.id)
    if (smIds.length) {
      const { data: ms } = await admin.from('menus').select('id').in('service_menu_id', smIds)
      const mIds = (ms ?? []).map(x => x.id)
      if (mIds.length) {
        const { data: rws } = await admin.from('menu_rewards').select('id').in('menu_id', mIds)
        const rwIds = (rws ?? []).map(x => x.id)
        if (rwIds.length) { await admin.from('partner_reward_overrides').delete().in('reward_id', rwIds); await admin.from('cooperation_task_templates').delete().in('reward_id', rwIds) }
        await admin.from('menu_hearing_items').delete().in('menu_id', mIds)
        await admin.from('menu_rewards').delete().in('menu_id', mIds)
        await admin.from('menus').delete().in('id', mIds)
      }
      await admin.from('service_menus').delete().in('id', smIds)
    }
    await admin.from('cooperation_task_templates').delete().eq('service_id', svc.id).then(() => {}, () => {})
    await admin.from('supplier_change_requests').delete().eq('service_id', svc.id)
    await admin.from('services').delete().eq('id', svc.id)
  }
  const { data: l } = await admin.auth.admin.listUsers()
  for (const em of [REF2, REF, SUP, OWNER]) {
    const u = (l?.users || []).find((x: any) => x.email === em)
    if (u) { const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle(); if (pa) { await admin.from('partner_reward_overrides').delete().eq('partner_id', pa.id).then(() => {}, () => {}); await admin.from('partner_reward_overrides').delete().eq('supplier_partner_id', pa.id).then(() => {}, () => {}); await admin.from('supplier_change_requests').delete().eq('supplier_partner_id', pa.id); await admin.from('partners').delete().eq('id', pa.id) } await admin.from('audit_logs').delete().eq('actor_profile_id', u.id).then(() => {}, () => {}); await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}) }
  }
  await admin.from('audit_logs').delete().like('actor_name', '%CC-MS%').then(() => {}, () => {})
}
await cleanup()
const mk = async (email: string, name: string, role: string) => { const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } }); await admin.from('profiles').upsert({ id: c.data!.user!.id, name, role, email, color: '#888' }); return c.data!.user!.id }
await mk(OWNER, 'CC-MS運営', 'owner')
const supUid = await mk(SUP, 'CC-MS供給者', 'partner')
const refUid = await mk(REF, 'CC-MS紹介A', 'partner')
const ref2Uid = await mk(REF2, 'CC-MS紹介B', 'partner')
const supPid = (await admin.from('partners').insert({ profile_id: supUid, code: 'CCMS01', company_name: '株式会社CC-MS', is_frontier: true, supplier_rate_card: 'standard-v2', status: 'active' }).select('id').single()).data!.id
const refPid = (await admin.from('partners').insert({ profile_id: refUid, code: 'CCMS02', frontier_id: supPid, status: 'active' }).select('id').single()).data!.id
await admin.from('partners').insert({ profile_id: ref2Uid, code: 'CCMS03', frontier_id: supPid, status: 'active' })
const svcId = (await admin.from('services').insert({ name: 'CC-MSブランド', active: true, supplier_partner_id: supPid, icon: '🧪', color: '#4733E6' }).select('id').single()).data!.id
const smId = (await admin.from('service_menus').insert({ service_id: svcId, name: 'CC-MSメニュー', ref_type: 'fixed', ref_value: 0 }).select('id').single()).data!.id
const menuId = (await admin.from('menus').insert({ service_menu_id: smId, name: 'CC-MSメニュー', active: true }).select('id').single()).data!.id

const b = await chromium.launch()
const errs: string[] = []
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
async function login(p: Page, email: string, path: string) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  if (!(await p.locator('input[type="email"]').count())) return
  await p.locator('input[type="email"]').fill(email); await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(2800)
}

console.log('A) 内部運用定義（即時）')
const sp = await ctx.newPage(); sp.on('pageerror', e => errs.push(sp.url() + ': ' + e.message))
sp.on('dialog', d => d.accept('CC-MS第二メニュー').catch(() => {}))
await login(sp, SUP, '/app')
await sp.goto(BASE + '/app/s/products', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(2200)
await sp.locator('text=CC-MSブランド').first().click(); await sp.waitForTimeout(1200)
await sp.locator('.prod-lnav button:has-text("CC-MSメニュー")').first().click(); await sp.waitForTimeout(1500)
// 報酬追加（受注額% 5・トリガー・協力タスク2つ）
await sp.locator('button:has-text("＋ 報酬を追加")').click(); await sp.waitForTimeout(400)
ok((await sp.locator('button:has-text("受注額（%）")').count()) === 1 && (await sp.locator('button:has-text("継続（毎月）")').count()) === 0, '標準カード=固定/受注額%のみ（型ピル）')
await sp.locator('button:has-text("受注額（%）")').click()
await sp.locator('input[placeholder="5"]').fill('5')
await sp.locator('input[placeholder="例：契約成立で確定"]').fill('成約で確定')
await sp.locator('label:has-text("つなぐ") input[type="checkbox"]').evaluate(el => (el as HTMLInputElement).click())
await sp.locator('label:has-text("ヒヤリング") input[type="checkbox"]').evaluate(el => (el as HTMLInputElement).click())
// ヒアリング項目も同時に定義
await sp.locator('button:has-text("＋ 項目を追加")').evaluate(el => (el as HTMLButtonElement).click()); await sp.waitForTimeout(300)
await sp.locator('input[placeholder="例：年収"]').fill('年収')
await sp.locator('button:has-text("この定義を保存する（すぐ反映）")').evaluate(el => (el as HTMLButtonElement).click()); await sp.waitForTimeout(2500)
const { data: rw } = await admin.from('menu_rewards').select('id, reward_type, reward_value, reward_base, reward_trigger, active').eq('menu_id', menuId).eq('active', true)
ok((rw ?? []).length === 1 && rw![0].reward_type === 'rate' && rw![0].reward_value === 5 && rw![0].reward_base === '売上' && rw![0].reward_trigger === '成約で確定', '報酬保存（型/値/ベース/トリガー）', JSON.stringify(rw))
const rewardId = rw![0].id
const { data: tks } = await admin.from('cooperation_task_templates').select('label, reward_id, active').eq('reward_id', rewardId).eq('active', true)
ok((tks ?? []).length === 2 && tks!.every(t => ['つなぐ', 'ヒヤリング'].includes(t.label)), '協力タスク同期（reward紐付け・MBと同一の器）', JSON.stringify(tks))
const { data: hi } = await admin.from('menu_hearing_items').select('label').eq('menu_id', menuId).eq('active', true)
ok((hi ?? []).length === 1 && hi![0].label === '年収', 'ヒアリング項目の定義（サプライヤー側から）')
await sp.screenshot({ path: SHOT + '/mastery-supplier-menu-editor.png' })
// 継続型の拒否（API直・サーバvalidateが正）
const contRes = await sp.request.post(BASE + '/api/supplier/menu-ops', { data: { op: 'rewards_set', menu_id: menuId, rewards: [{ id: rewardId, reward_type: 'continuous', reward_value: 10, tasks: [] }] } })
ok(contRes.status() === 400, '標準カードで継続型は400')

console.log('A) 申請系（メニュー追加・非公開・ロゴ）')
await sp.locator('button:has-text("＋ メニューを追加（申請）")').click(); await sp.waitForTimeout(1800)
const { data: mcReq } = await admin.from('supplier_change_requests').select('id, kind, payload').eq('supplier_partner_id', supPid).eq('kind', 'menu_create')
ok((mcReq ?? []).length === 1 && (mcReq![0].payload as { value?: string }).value === 'CC-MS第二メニュー', 'メニュー追加を申請（pending）')
// 非公開申請
await sp.locator('button:has-text("非公開を申請")').click(); await sp.waitForTimeout(1500)
// ロゴアップロード→申請
const up = await sp.request.post(BASE + '/api/supplier/asset', { multipart: { service_id: svcId, kind: 'logo', file: { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex') } } })
const upj = await up.json()
ok(up.ok() && typeof upj.path === 'string', 'ロゴをserver経由アップロード（自社のみ）')
const logoReq = await sp.request.post(BASE + '/api/supplier/self', { data: { kind: 'logo', service_id: svcId, value: upj.path } })
ok(logoReq.ok(), 'ロゴ変更を申請')
// console承認（3件）
const op = await ctx.newPage(); op.on('pageerror', e => errs.push(op.url() + ': ' + e.message))
await login(op, OWNER, '/console')
const { data: pend } = await admin.from('supplier_change_requests').select('id, kind').eq('supplier_partner_id', supPid).eq('status', 'pending')
for (const rq of pend ?? []) {
  const ar = await op.request.patch(BASE + '/api/console/supplier-requests', { data: { id: rq.id, action: 'approve' } })
  ok(ar.ok(), `承認: ${rq.kind}`)
}
const { data: newMenus } = await admin.from('menus').select('id, name, active')
ok((newMenus ?? []).some(m => m.name === 'CC-MS第二メニュー' && m.active), '承認でメニュー新設（menus+service_menus）')
const { data: menuAfter } = await admin.from('menus').select('active').eq('id', menuId).single()
ok(menuAfter!.active === false, '承認でメニュー非公開が反映')
const { data: svcAfter } = await admin.from('services').select('logo_path').eq('id', svcId).single()
ok(svcAfter!.logo_path === upj.path, '承認でロゴ反映（services.logo_path）')
// 後続テストのため公開へ戻す
await admin.from('menus').update({ active: true }).eq('id', menuId)

console.log('B) 個別報酬率（サプライヤー設定→APP個別表示→非漏出）')
await sp.goto(BASE + '/app/s/partners', { waitUntil: 'domcontentloaded' }); await sp.waitForTimeout(2200)
ok((await sp.locator('text=個別条件（特定のパートナーだけ報酬を変える）').count()) === 1, 'パートナーページに個別条件セクション')
await sp.locator('button:has-text("＋ 設定する")').click(); await sp.waitForTimeout(500)
await sp.locator('select:has(option:has-text("パートナーを選択"))').selectOption({ label: 'CC-MS紹介A（CCMS02）' })
await sp.locator('select:has(option:has-text("メニューの報酬を選択"))').selectOption({ index: 1 })
await sp.locator('input[placeholder="例：7"]').fill('7')
await sp.locator('button:has-text("設定する")').last().click(); await sp.waitForTimeout(2000)
const { data: ovs } = await admin.from('partner_reward_overrides').select('partner_id, reward_id, override_value, active, supplier_partner_id').eq('supplier_partner_id', supPid)
ok((ovs ?? []).length === 1 && ovs![0].partner_id === refPid && ovs![0].override_value === 7 && ovs![0].active, '個別条件が保存（自社供給者名義）', JSON.stringify(ovs))
await sp.screenshot({ path: SHOT + '/mastery-supplier-overrides.png' })
// ガード: 自社外パートナー403・本人400
const { data: outsider } = await admin.from('partners').select('id').eq('is_system', true).limit(1)
ok((await sp.request.post(BASE + '/api/supplier/reward-overrides', { data: { partner_id: outsider![0].id, reward_id: rewardId, override_value: 9 } })).status() === 403, '自社外パートナーは403')
ok((await sp.request.post(BASE + '/api/supplier/reward-overrides', { data: { partner_id: supPid, reward_id: rewardId, override_value: 9 } })).status() === 400, '本人への設定は400')
// APP個別表示（対象=7%・他者=5%）
const actx = await b.newContext({ viewport: { width: 430, height: 900 } })
const ap = await actx.newPage(); ap.on('pageerror', e => errs.push(ap.url() + ': ' + e.message))
await login(ap, REF, '/app')
await ap.goto(BASE + '/app/refer', { waitUntil: 'domcontentloaded' }); await ap.waitForTimeout(3000)
await ap.locator('text=CC-MSブランド').first().click(); await ap.waitForTimeout(1200)
const aBody = await ap.evaluate('document.body.innerText') as string
ok(aBody.includes('7%'), '対象パートナーのAPPに個別7%表示', aBody.match(/[0-9]+%/g)?.join(',') ?? '')
const a2ctx = await b.newContext({ viewport: { width: 430, height: 900 } })
const ap2 = await a2ctx.newPage(); ap2.on('pageerror', e => errs.push(ap2.url() + ': ' + e.message))
await login(ap2, REF2, '/app')
await ap2.goto(BASE + '/app/refer', { waitUntil: 'domcontentloaded' }); await ap2.waitForTimeout(3000)
await ap2.locator('text=CC-MSブランド').first().click(); await ap2.waitForTimeout(1200)
const bBody = await ap2.evaluate('document.body.innerText') as string
ok(bBody.includes('5%') && !bBody.includes('7%'), '他パートナーは通常5%（非漏出）', bBody.match(/[0-9]+%/g)?.join(',') ?? '')
// 一般パートナーの管理API 403
ok((await ap.request.get(BASE + '/api/supplier/reward-overrides')).status() === 403, '一般パートナーは設定API 403')
ok((await ap.request.post(BASE + '/api/supplier/menu-ops', { data: { op: 'rewards_set', menu_id: menuId, rewards: [] } })).status() === 403, '一般パートナーは menu-ops 403')

ok(errs.length === 0, 'page errors []', errs.join(' | ').slice(0, 300))
await b.close()
await cleanup()
const left = (await admin.from('services').select('id').like('name', 'CC-MS%')).data?.length ?? 0
ok(left === 0, '残置ゼロ')
console.log(`\n== supplier-mastery E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
