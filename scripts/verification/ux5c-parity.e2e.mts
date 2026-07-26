/**
 * UX-5c batch E2E: feature-parity surfaces, before/after screenshots, and zero residue.
 * Production is the UX-5b baseline; localhost is the candidate build.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Browser, Page } from 'playwright'
import { launchChromium } from './playwright-launch.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const LOCAL = process.env.BASE_APP || 'http://localhost:4599'
const BASELINE = process.env.BASELINE_APP || 'https://mb-partners.app'
const PASSWORD = 'CcUx5c!2026'
const PREFIX = 'CC-UX5C'
const EMAILS = {
  owner: 'cc-ux5c-owner@mb-system.internal',
  supplier: 'cc-ux5c-supplier@mb-system.internal',
  vendor: 'cc-ux5c-vendor@mb-system.internal',
}
const SHOTS = 'docs/reports/ux5c_screens'
mkdirSync(SHOTS, { recursive: true })

let pass = 0
let fail = 0
const ok = (condition: boolean, label: string, detail = '') => {
  if (condition) {
    pass++
    console.log('  ✓', label)
  } else {
    fail++
    console.log('  ✗', label, detail.slice(0, 300))
  }
}

let serviceId = ''
let serviceMenuId = ''
let menuId = ''
let rewardId = ''
let supplierPartnerId = ''
let vendorUserId = ''
let deliveryId = ''
let dealId = ''
let assignmentId = ''
let deal2Id = ''
let assignment2Id = ''

async function cleanup() {
  for (const id of [dealId, deal2Id].filter(Boolean)) {
    await admin.from('deal_events').delete().eq('deal_id', id)
    await admin.from('deal_tasks').delete().eq('deal_id', id)
    await admin.from('delivery_assignments').delete().eq('deal_id', id)
    await admin.from('deal_items').delete().eq('deal_id', id)
    await admin.from('deals').delete().eq('id', id)
  }
  const { data: prefixedDeals } = await admin.from('deals').select('id').like('customer_name', `${PREFIX}%`)
  for (const row of prefixedDeals ?? []) {
    await admin.from('deal_events').delete().eq('deal_id', row.id)
    await admin.from('deal_tasks').delete().eq('deal_id', row.id)
    await admin.from('delivery_assignments').delete().eq('deal_id', row.id)
    await admin.from('deal_items').delete().eq('deal_id', row.id)
    await admin.from('deals').delete().eq('id', row.id)
  }
  const { data: services } = await admin.from('services').select('id').like('name', `${PREFIX}%`)
  for (const service of services ?? []) {
    const { data: serviceMenus } = await admin.from('service_menus').select('id').eq('service_id', service.id)
    const serviceMenuIds = (serviceMenus ?? []).map(row => row.id)
    if (serviceMenuIds.length) {
      const { data: menus } = await admin.from('menus').select('id').in('service_menu_id', serviceMenuIds)
      const menuIds = (menus ?? []).map(row => row.id)
      if (menuIds.length) {
        const { data: rewards } = await admin.from('menu_rewards').select('id').in('menu_id', menuIds)
        const rewardIds = (rewards ?? []).map(row => row.id)
        if (rewardIds.length) await admin.from('cooperation_task_templates').delete().in('reward_id', rewardIds)
        await admin.from('menu_hearing_items').delete().in('menu_id', menuIds)
        await admin.from('menu_rewards').delete().in('menu_id', menuIds)
        await admin.from('menus').delete().in('id', menuIds)
      }
      await admin.from('service_menus').delete().in('id', serviceMenuIds)
    }
    await admin.from('cooperation_task_templates').delete().eq('service_id', service.id)
    await admin.from('supplier_change_requests').delete().eq('service_id', service.id)
    await admin.from('services').delete().eq('id', service.id)
  }
  const { data: deliveries } = await admin.from('deliveries').select('id').like('name', `${PREFIX}%`)
  for (const delivery of deliveries ?? []) {
    await admin.from('delivery_assignments').delete().eq('delivery_id', delivery.id)
    await admin.from('delivery_payout_items').delete().eq('delivery_id', delivery.id)
    await admin.from('invites').delete().eq('delivery_id', delivery.id)
    await admin.from('deliveries').delete().eq('id', delivery.id)
  }
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const email of Object.values(EMAILS)) {
    const user = users.users.find(candidate => candidate.email === email)
    if (!user) continue
    const { data: partner } = await admin.from('partners').select('id').eq('profile_id', user.id).maybeSingle()
    if (partner) {
      await admin.from('invites').delete().eq('frontier_id', partner.id)
      await admin.from('partners').delete().eq('id', partner.id)
    }
    await admin.from('audit_logs').delete().eq('actor_profile_id', user.id)
    await admin.from('profiles').delete().eq('id', user.id)
    await admin.auth.admin.deleteUser(user.id)
  }
  await admin.from('audit_logs').delete().like('actor_name', `%${PREFIX}%`)
}

async function createUser(email: string, name: string, role: string) {
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, app_metadata: { role } })
  if (created.error || !created.data.user) throw created.error ?? new Error(`create ${email}`)
  await admin.from('profiles').upsert({ id: created.data.user.id, email, name, role, color: '#4733E6' })
  return created.data.user.id
}

async function fixture() {
  await cleanup()
  await createUser(EMAILS.owner, `${PREFIX}運営`, 'owner')
  const supplierUserId = await createUser(EMAILS.supplier, `${PREFIX}供給者`, 'partner')
  vendorUserId = await createUser(EMAILS.vendor, `${PREFIX}委託先`, 'vendor')
  const partner = await admin.from('partners').insert({
    profile_id: supplierUserId,
    code: 'CCUX5C',
    company_name: `${PREFIX}株式会社`,
    status: 'active',
    is_frontier: true,
    supplier_rate_card: 'standard-v2',
  }).select('id').single()
  if (partner.error) throw partner.error
  supplierPartnerId = partner.data.id
  const service = await admin.from('services').insert({
    name: `${PREFIX}ブランド`,
    active: true,
    supplier_partner_id: supplierPartnerId,
    supplier_memo: `${PREFIX}社内メモ`,
    icon: '🧪',
    color: '#4733E6',
  }).select('id').single()
  if (service.error) throw service.error
  serviceId = service.data.id
  const serviceMenu = await admin.from('service_menus').insert({
    service_id: serviceId,
    name: `${PREFIX}メニュー`,
    ref_type: 'fixed',
    ref_value: 0,
  }).select('id').single()
  if (serviceMenu.error) throw serviceMenu.error
  serviceMenuId = serviceMenu.data.id
  const menu = await admin.from('menus').insert({
    service_menu_id: serviceMenuId,
    name: `${PREFIX}メニュー`,
    active: true,
  }).select('id').single()
  if (menu.error) throw menu.error
  menuId = menu.data.id
  const reward = await admin.from('menu_rewards').insert({
    menu_id: menuId,
    reward_type: 'fixed',
    reward_value: 1000,
    sort: 0,
    active: true,
  }).select('id').single()
  if (reward.error) throw reward.error
  rewardId = reward.data.id
  await admin.from('cooperation_task_templates').insert({
    service_id: serviceId,
    reward_id: rewardId,
    label: 'ヒアリング',
    kind: 'manual',
    required: true,
    sort: 0,
    active: true,
    description: `${PREFIX}変更前説明`,
  })
  const delivery = await admin.from('deliveries').insert({
    name: `${PREFIX}委託先`,
    active: true,
    auth_user_id: vendorUserId,
    supplier_partner_id: supplierPartnerId,
  }).select('id').single()
  if (delivery.error) throw delivery.error
  deliveryId = delivery.data.id
  const systemPartner = await admin.from('partners').select('id').eq('is_system', true).limit(1).single()
  if (systemPartner.error) throw systemPartner.error
  const createDeal = async (customer: string) => {
    const deal = await admin.from('deals').insert({
      partner_id: systemPartner.data.id,
      service_id: serviceId,
      menu_id: serviceMenuId,
      reward_snapshot: { menu_id: menuId },
      customer_name: customer,
      channel: 'cooperation',
      source: 'partner_form',
      consent: true,
      status: 'confirmed',
      fixed_month: '2026-07-01',
    }).select('id').single()
    if (deal.error) throw deal.error
    return deal.data.id
  }
  dealId = await createDeal(`${PREFIX}案件A`)
  deal2Id = await createDeal(`${PREFIX}案件B`)
  await admin.from('deal_tasks').insert({
    deal_id: dealId,
    label: 'ヒアリング',
    kind: 'manual',
    required: true,
    done: true,
    note: `${PREFIX}実施済`,
    sort: 0,
  })
  const assignment = await admin.from('delivery_assignments').insert({
    deal_id: dealId,
    delivery_id: deliveryId,
    base_fee: 30000,
    status: 'delivered',
  }).select('id, assigned_at').single()
  if (assignment.error) throw assignment.error
  assignmentId = assignment.data.id
  const assignment2 = await admin.from('delivery_assignments').insert({
    deal_id: deal2Id,
    delivery_id: deliveryId,
    base_fee: 20000,
    status: 'accepted',
  }).select('id').single()
  if (assignment2.error) throw assignment2.error
  assignment2Id = assignment2.data.id
  const now = Date.now()
  await admin.from('deal_events').insert([
    { deal_id: dealId, visible_to_partner: false, body: `委託を提示: ${PREFIX}委託先`, created_at: new Date(now - 3000).toISOString() },
    { deal_id: dealId, visible_to_partner: false, body: `委託を承諾しました: ${PREFIX}委託先`, created_at: new Date(now - 2000).toISOString() },
    { deal_id: dealId, visible_to_partner: false, body: `納品済みにしました: ${PREFIX}委託先`, created_at: new Date(now - 1000).toISOString() },
  ])
}

async function login(page: Page, base: string, surface: keyof typeof EMAILS) {
  const path = surface === 'vendor' ? '/vendor/login' : surface === 'owner' ? '/console/login' : '/login'
  await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  if (!new URL(page.url()).pathname.includes('login')) return
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.locator('button[type="submit"]').first().waitFor({ state: 'visible' })
    await page.waitForFunction(() => !(document.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.disabled, null, { timeout: 20_000 }).catch(() => {})
    await page.locator('input[type="email"]').fill(EMAILS[surface])
    await page.locator('input[type="password"]').fill(PASSWORD)
    await page.locator('button[type="submit"]').first().click()
    await page.waitForFunction(() => !location.pathname.includes('login'), null, { timeout: 20_000 }).catch(() => {})
    if (!new URL(page.url()).pathname.includes('login')) return
  }
  throw new Error(`${surface} login failed at ${page.url()}: ${(await page.locator('body').innerText()).slice(0, 300)}`)
}

async function shot(page: Page, name: string) {
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
}

async function capture(page: Page, base: string, label: 'before' | 'after') {
  await page.setViewportSize({ width: 375, height: 667 })
  await login(page, base, 'owner')
  await page.goto(base + '/console/settings', { waitUntil: 'domcontentloaded' })
  await shot(page, `${label}-console-settings`)

  await page.setViewportSize({ width: 1280, height: 800 })
  await login(page, base, 'supplier')
  await page.goto(base + '/app/s/products', { waitUntil: 'domcontentloaded' })
  await page.getByText(`${PREFIX}ブランド`, { exact: true }).first().click()
  await page.getByRole('button', { name: `${PREFIX}メニュー`, exact: true }).first().click()
  await shot(page, `${label}-supplier-products`)
  await page.goto(base + '/app/s/deals', { waitUntil: 'domcontentloaded' })
  await page.getByText(`${PREFIX}案件A`).first().click()
  await shot(page, `${label}-supplier-deal`)
  await page.goto(base + '/app/s/partners', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: /パートナーを招待/ }).first().click()
  await shot(page, `${label}-supplier-invite`)
  await page.goto(base + '/app/frontier', { waitUntil: 'domcontentloaded' })
  await shot(page, `${label}-frontier-invite`)

  await page.setViewportSize({ width: 375, height: 667 })
  await login(page, base, 'vendor')
  await page.goto(base + '/vendor/settings', { waitUntil: 'domcontentloaded' })
  await shot(page, `${label}-vendor-settings`)
  await page.goto(base + `/vendor/cases/${assignmentId}`, { waitUntil: 'domcontentloaded' })
  await shot(page, `${label}-vendor-case`)
  await page.goto(base + '/vendor/inbox', { waitUntil: 'domcontentloaded' })
  await shot(page, `${label}-vendor-inbox`)
}

let browser: Browser | null = null
try {
  await fixture()
  browser = await launchChromium({ headless: true })
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const runner = await context.newPage()
  console.log('A) UX-5b production baseline screenshots')
  await capture(runner, BASELINE, 'before')
  console.log('B) UX-5c candidate screenshots and UI assertions')
  await capture(runner, LOCAL, 'after')

  await runner.setViewportSize({ width: 1280, height: 800 })
  await login(runner, LOCAL, 'supplier')
  await runner.goto(LOCAL + '/app/s/products', { waitUntil: 'domcontentloaded' })
  await runner.getByText(`${PREFIX}ブランド`, { exact: true }).first().click()
  await runner.getByRole('button', { name: `${PREFIX}メニュー`, exact: true }).first().click()
  await runner.getByRole('button', { name: 'ヒアリングの説明を編集' }).click()
  await runner.getByPlaceholder('登録画面のⓘに表示する説明').fill(`${PREFIX}更新済説明`)
  const saveButtons = runner.getByRole('button', { name: '保存する', exact: true })
  ok(await saveButtons.count() === 1, 'supplier保存入口は1つ')
  await saveButtons.click()
  await runner.getByRole('status').filter({ hasText: '保存しました（すぐに反映されます）' }).waitFor({ state: 'visible' })
  const { data: template } = await admin.from('cooperation_task_templates').select('description').eq('reward_id', rewardId).eq('label', 'ヒアリング').single()
  ok(template?.description === `${PREFIX}更新済説明`, 'タスク説明をフッター保存から反映', JSON.stringify(template))
  await runner.goto(LOCAL + '/app/s/deals', { waitUntil: 'domcontentloaded' })
  await runner.getByText(`${PREFIX}案件A`).first().click()
  ok(await runner.getByText('協力タスク', { exact: true }).isVisible(), 'supplier案件ドロワーに協力タスク')
  ok(await runner.getByText(`${PREFIX}実施済`, { exact: true }).isVisible(), 'supplier案件ドロワーに実施内容')

  await runner.setViewportSize({ width: 375, height: 667 })
  await login(runner, LOCAL, 'vendor')
  await runner.goto(LOCAL + `/vendor/cases/${assignmentId}`, { waitUntil: 'domcontentloaded' })
  await runner.waitForTimeout(1600)
  const vendorBody = await runner.locator('body').innerText()
  ok(vendorBody.includes(`${PREFIX}メニュー`), 'vendor案件詳細にメニュー名', vendorBody)
  ok(['提示', '受諾', '納品'].every(label => vendorBody.includes(label)), 'vendor案件詳細に3行時系列', vendorBody)
  await runner.goto(LOCAL + '/vendor/inbox', { waitUntil: 'domcontentloaded' })
  await runner.getByRole('button', { name: 'すべて既読にする' }).waitFor({ state: 'visible' })
  ok(await runner.getByRole('button', { name: 'すべて既読にする' }).isVisible(), 'vendor通知に一括既読')
  await runner.getByRole('button', { name: 'すべて既読にする' }).click()
  await runner.waitForTimeout(800)
  const { data: vendorUser } = await admin.auth.admin.getUserById(vendorUserId)
  const reads = vendorUser.user?.user_metadata?.vendor_notification_reads
  ok(Array.isArray(reads) && reads.includes(`a${assignmentId}`) && reads.includes(`a${assignment2Id}`), 'vendor通知既読を本人へ永続化', JSON.stringify(reads))
  await runner.reload({ waitUntil: 'domcontentloaded' })
  ok(await runner.getByRole('button', { name: 'すべて既読にする' }).count() === 0, 'vendor通知既読が再読込後も維持')
  await runner.goto(LOCAL + '/vendor/settings', { waitUntil: 'domcontentloaded' })
  await runner.getByText('サービスガイド', { exact: true }).waitFor({ state: 'visible' })
  ok(await runner.getByText('サービスガイド', { exact: true }).isVisible(), 'vendor設定にサービスガイド')

  const { data: consoleService } = await admin.from('services').select('supplier_memo').eq('id', serviceId).single()
  ok(consoleService?.supplier_memo === `${PREFIX}社内メモ`, 'consoleとsupplierが同じ社内メモ列を共有')
} catch (error) {
  fail++
  console.error(error)
} finally {
  await browser?.close()
  await cleanup()
  const { data: remainingDeals } = await admin.from('deals').select('id').like('customer_name', `${PREFIX}%`)
  const { data: remainingServices } = await admin.from('services').select('id').like('name', `${PREFIX}%`)
  const { data: remainingUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ok((remainingDeals ?? []).length === 0 && (remainingServices ?? []).length === 0 && !remainingUsers.users.some(user => Object.values(EMAILS).includes(user.email ?? '')), 'UX-5c fixture残置0')
}

console.log(`\nUX5C-PARITY: ${pass} passed / ${fail} failed`)
process.exit(fail ? 1 : 0)
