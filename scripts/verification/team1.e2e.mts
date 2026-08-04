/** TEAM-1 browser proof. Throwaway identities and rows only; no production user/entity reads. */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Page } from 'playwright'
import { launchChromium } from './playwright-launch.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const at = line.indexOf('='); return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = process.env.BASE_APP || 'http://localhost:4599'
const PASSWORD = 'CcTeam1!2026xx'
const PREFIX = 'CC-TEAM1'
const EMAIL = {
  partner: 'cc-team1-partner@mb-system.internal',
  supplier: 'cc-team1-supplier@mb-system.internal',
  owner: 'cc-team1-owner@mb-system.internal',
}
const FORBIDDEN = 'CC_TEAM1_SECRET_987654321'
let dealId = ''; let serviceId = ''; let serviceMenuId = ''; let menuId = ''; let deliveryId = ''
let partnerId = ''; let supplierPartnerId = ''; let ownerId = ''
let pass = 0; let fail = 0
const ok = (condition: boolean, label: string, detail = '') => condition
  ? (pass++, console.log(`  ✓ ${label}`))
  : (fail++, console.error(`  ✗ ${label}${detail ? `: ${detail.slice(0, 400)}` : ''}`))

async function createUser(email: string, name: string, role: string) {
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, app_metadata: { role } })
  if (!created.data.user) throw created.error || new Error(`create ${email}`)
  const profile = await admin.from('profiles').insert({ id: created.data.user.id, name, email, role, color: '#4733E6' })
  if (profile.error) throw profile.error
  return created.data.user.id
}

async function cleanup() {
  const prefixed = await admin.from('deals').select('id').like('customer_name', `${PREFIX}%`)
  const dealIds = [...new Set([dealId, ...(prefixed.data ?? []).map(row => row.id)].filter(Boolean))]
  if (dealIds.length) {
    await admin.from('delivery_expenses').delete().in('deal_id', dealIds).then(() => {}, () => {})
    await admin.from('delivery_assignments').delete().in('deal_id', dealIds)
    await admin.from('deal_tasks').delete().in('deal_id', dealIds)
    await admin.from('deal_events').delete().in('deal_id', dealIds)
    await admin.from('deal_items').delete().in('deal_id', dealIds)
    await admin.from('deals').delete().in('id', dealIds)
  }
  const services = await admin.from('services').select('id').like('name', `${PREFIX}%`)
  for (const service of services.data ?? []) {
    const sms = await admin.from('service_menus').select('id').eq('service_id', service.id)
    const smIds = (sms.data ?? []).map(row => row.id)
    if (smIds.length) {
      const menus = await admin.from('menus').select('id').in('service_menu_id', smIds)
      const menuIds = (menus.data ?? []).map(row => row.id)
      if (menuIds.length) {
        await admin.from('menu_rewards').delete().in('menu_id', menuIds)
        await admin.from('menus').delete().in('id', menuIds)
      }
      await admin.from('service_menus').delete().in('id', smIds)
    }
    await admin.from('services').delete().eq('id', service.id)
  }
  const deliveries = await admin.from('deliveries').select('id').like('name', `${PREFIX}%`)
  for (const delivery of deliveries.data ?? []) {
    await admin.from('delivery_assignments').delete().eq('delivery_id', delivery.id)
    await admin.from('deliveries').delete().eq('id', delivery.id)
  }
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const user of listed.data.users.filter(item => Object.values(EMAIL).includes(item.email ?? ''))) {
    await admin.from('audit_logs').delete().eq('actor_profile_id', user.id)
    await admin.from('partners').delete().eq('profile_id', user.id)
    await admin.from('profiles').delete().eq('id', user.id)
    await admin.auth.admin.deleteUser(user.id)
  }
  await admin.from('audit_logs').delete().like('target', `${PREFIX}%`)
}

async function fixture() {
  await cleanup()
  const partnerUserId = await createUser(EMAIL.partner, `${PREFIX}紹介者`, 'partner')
  const supplierUserId = await createUser(EMAIL.supplier, `${PREFIX}供給者`, 'partner')
  ownerId = await createUser(EMAIL.owner, `${PREFIX}運営担当`, 'owner')
  const partner = await admin.from('partners').insert({ profile_id: partnerUserId, code: 'CCTEAM1P', status: 'active' }).select('id').single()
  const supplier = await admin.from('partners').insert({ profile_id: supplierUserId, code: 'CCTEAM1S', company_name: `${PREFIX}供給会社`, status: 'active', supplier_rate_card: 'standard-v2' }).select('id').single()
  if (!partner.data || !supplier.data) throw partner.error || supplier.error || new Error('partner fixture failed')
  partnerId = partner.data.id; supplierPartnerId = supplier.data.id
  const service = await admin.from('services').insert({ name: `${PREFIX}ブランド`, active: true, supplier_partner_id: supplierPartnerId, icon: '🧪', color: '#4733E6' }).select('id').single()
  if (!service.data) throw service.error || new Error('service fixture failed')
  serviceId = service.data.id
  const sm = await admin.from('service_menus').insert({ service_id: serviceId, name: `${PREFIX}メニュー`, ref_type: 'fixed', ref_value: 1000 }).select('id').single()
  if (!sm.data) throw sm.error || new Error('service menu fixture failed')
  serviceMenuId = sm.data.id
  const menu = await admin.from('menus').insert({ service_menu_id: serviceMenuId, name: `${PREFIX}メニュー`, active: true }).select('id').single()
  if (!menu.data) throw menu.error || new Error('menu fixture failed')
  menuId = menu.data.id
  const delivery = await admin.from('deliveries').insert({ name: `${PREFIX}実務会社`, active: true, supplier_partner_id: supplierPartnerId }).select('id').single()
  if (!delivery.data) throw delivery.error || new Error('delivery fixture failed')
  deliveryId = delivery.data.id
  const deal = await admin.from('deals').insert({
    partner_id: partnerId,
    service_id: serviceId,
    menu_id: serviceMenuId,
    customer_name: `${PREFIX}案件`,
    customer_type: 'individual',
    channel: 'referral',
    source: 'partner_form',
    consent: true,
    status: 'in_progress',
    amount: 0,
    reward_snapshot: { menu_id: menuId, reward_type: 'fixed', reward_value: 1000 },
  }).select('id').single()
  if (!deal.data) throw deal.error || new Error('deal fixture failed')
  dealId = deal.data.id
  const events = await admin.from('deal_events').insert([
    { deal_id: dealId, visible_to_partner: true, body: 'ステータスを「対応中」に変更しました' },
    { deal_id: dealId, visible_to_partner: true, body: `委託費 ¥987,654,321 / fee_snapshot / supplier_charges / ${FORBIDDEN}` },
    { deal_id: dealId, visible_to_partner: true, body: `担当が決まりました 委託費 ¥1 / ${FORBIDDEN}` },
  ])
  if (events.error) throw events.error
}

async function login(page: Page, path: '/login' | '/console/login', email: string) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForFunction(() => !location.pathname.includes('login'), null, { timeout: 25_000 })
}

await fixture()
let browser = await launchChromium({ headless: true })
try {
  // Console operation writes both the public-safe event and audit entry.
  const ownerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const ownerPage = await ownerContext.newPage()
  await login(ownerPage, '/console/login', EMAIL.owner)
  const patchResult = await ownerPage.evaluate(async ({ id, director }) => {
    const response = await fetch(`/api/console/deals/${id}/pnl`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ director_id: director }) })
    return { status: response.status, body: await response.json() }
  }, { id: dealId, director: ownerId })
  ok(patchResult.status === 200 && patchResult.body.ok, 'console担当変更APIが成功', JSON.stringify(patchResult))
  const recordedEvents = await admin.from('deal_events').select('body,visible_to_partner,created_by').eq('deal_id', dealId).eq('body', '担当が決まりました')
  ok(recordedEvents.data?.length === 1 && recordedEvents.data[0]?.visible_to_partner === true && recordedEvents.data[0]?.created_by === ownerId, '担当決定を公開許可イベントとして記録')
  const audit = await admin.from('audit_logs').select('action,meta').eq('actor_profile_id', ownerId).eq('action', 'MB担当を変更').eq('target', `${PREFIX}案件`)
  ok(audit.data?.length === 1 && audit.data[0]?.meta?.director_id === ownerId, 'console操作をaudit_logsへ併記')
  await ownerContext.close()

  // Unassigned delivery first: the honest waiting state is visible.
  // Codex single-process Chromium exits with its last context; isolate each surface.
  await browser.close().catch(() => {})
  browser = await launchChromium({ headless: true })
  const partnerContext = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const partnerPage = await partnerContext.newPage()
  await login(partnerPage, '/login', EMAIL.partner)
  await partnerPage.goto(`${BASE}/app/cases/${dealId}`, { waitUntil: 'domcontentloaded' })
  await partnerPage.getByText('この案件のチーム', { exact: true }).waitFor({ timeout: 25_000 })
  ok(await partnerPage.getByText('MBが担当を調整中です', { exact: true }).isVisible(), '未アサイン時の調整中表示')

  const assignment = await admin.from('delivery_assignments').insert({ deal_id: dealId, delivery_id: deliveryId, base_fee: 987654321, status: 'accepted' })
  if (assignment.error) throw assignment.error
  await partnerPage.reload({ waitUntil: 'domcontentloaded' })
  await partnerPage.getByText(`${PREFIX}実務会社`, { exact: true }).waitFor({ timeout: 25_000 })
  await partnerPage.getByText('詳細を見る（報酬内訳・履歴）', { exact: true }).click()
  const partnerBody = await partnerPage.locator('body').innerText()
  const partnerHtml = await partnerPage.content()
  ok(partnerBody.includes(`${PREFIX}運営担当`) && partnerBody.includes('MB担当') && partnerBody.includes(`${PREFIX}実務会社`) && partnerBody.includes('実務担当'), 'パートナー面に実名＋屋号のチーム表示')
  ok(partnerBody.includes('対応を始めました') && partnerBody.includes('担当が決まりました'), '許可イベントだけを平易語で表示')
  ok(!partnerBody.includes(FORBIDDEN) && !partnerHtml.includes(FORBIDDEN) && !partnerHtml.includes('987654321'), 'パートナーHTMLに金額系・許可外イベントなし')
  const direct = await partnerContext.request.get(`${BASE}/app/cases/${dealId}`)
  const directText = await direct.text()
  ok(direct.status() === 200 && !directText.includes(FORBIDDEN) && !directText.includes('987654321'), '認証付きページ応答にも漏出なし')
  const overflow = await partnerPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(overflow <= 0, `パートナー詳細375px横溢れゼロ (${overflow}px)`)
  await partnerPage.screenshot({ path: '/private/tmp/team1-partner-375.png', fullPage: true })
  await partnerContext.close()

  // Supplier is restricted to its own service ids; API returns only mapped public timeline text.
  await browser.close()
  browser = await launchChromium({ headless: true })
  const supplierContext = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const supplierPage = await supplierContext.newPage()
  await login(supplierPage, '/login', EMAIL.supplier)
  const apiDeal = await supplierPage.evaluate(async id => (await fetch('/api/supplier/self')).json().then(body => body.deals.find((deal: { id: string }) => deal.id === id)), dealId)
  ok(apiDeal?.director?.name === `${PREFIX}運営担当` && apiDeal?.team_delivery_name === `${PREFIX}実務会社`, 'supplier APIは自社案件のチームだけを返す')
  ok(apiDeal?.timeline?.length === 2 && apiDeal.timeline.every((event: { text: string }) => !event.text.includes(FORBIDDEN)), 'supplier APIも許可リスト外イベントを除外')
  await supplierPage.goto(`${BASE}/app/s/deals`, { waitUntil: 'domcontentloaded' })
  await supplierPage.locator('tr').filter({ hasText: `${PREFIX}案件` }).click()
  await supplierPage.getByText('この案件のチーム', { exact: true }).waitFor({ timeout: 25_000 })
  const supplierBody = await supplierPage.locator('body').innerText()
  ok(supplierBody.includes(`${PREFIX}運営担当`) && supplierBody.includes(`${PREFIX}実務会社`), 'supplierドロワーに同じチーム表示')
  ok(supplierBody.includes('対応を始めました') && !supplierBody.includes(FORBIDDEN), 'supplierドロワーの公開進行もdefault-deny')
  const supplierOverflow = await supplierPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(supplierOverflow <= 0, `supplierドロワー375px横溢れゼロ (${supplierOverflow}px)`)
  await supplierPage.screenshot({ path: '/private/tmp/team1-supplier-375.png', fullPage: true })
  await supplierContext.close()
} finally {
  await browser.close().catch(() => {})
  await cleanup()
  const deals = await admin.from('deals').select('id').like('customer_name', `${PREFIX}%`)
  const services = await admin.from('services').select('id').like('name', `${PREFIX}%`)
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ok((deals.data ?? []).length === 0 && (services.data ?? []).length === 0 && !users.data.users.some(user => Object.values(EMAIL).includes(user.email ?? '')), 'TEAM-1 fixture残置ゼロ')
}

console.log(`\nTEAM-1 E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
