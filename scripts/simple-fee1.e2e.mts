/**
 * SIMPLE-FEE-1 focused E2E.
 * Validates the v4 result. Before screenshots are stored as immutable evidence.
 * All records use the CCSF1 prefix and are removed in finally.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
import { computeCharges } from '@/lib/supplier-charges'
import { resolveFeeSnapshot } from '@/lib/supplier-fee'
import { launchChromium } from './verification/playwright-launch.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const i = line.indexOf('=')
  return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const APP_BASE = process.env.BASE_APP || 'http://localhost:4599'
const CONSOLE_BASE = process.env.BASE_CONSOLE || APP_BASE
const NO_BROWSER = process.env.NO_BROWSER === '1'
const KEEP_FIXTURE = process.env.KEEP_FIXTURE === '1'
const CLEANUP_ONLY = process.env.CLEANUP_ONLY === '1'
const PASSWORD = 'CcSf1!20260805'
const PREFIX = 'CCSF1'
const EMAILS = {
  owner: 'cc-sf1-owner@mb-system.internal',
  supplier: 'cc-sf1-supplier@mb-system.internal',
  outsider: 'cc-sf1-outsider@mb-system.internal',
  insider: 'cc-sf1-insider@mb-system.internal',
}
const SHOTS = 'docs/reports/simple_fee1_screens'
mkdirSync(SHOTS, { recursive: true })

let pass = 0
let fail = 0
const ok = (condition: boolean, label: string, detail = '') => {
  if (condition) { pass++; console.log('  ✓', label) }
  else { fail++; console.log('  ✗', label, detail.slice(0, 300)) }
}

async function cleanup() {
  const { data: deals } = await admin.from('deals').select('id').like('customer_name', `${PREFIX}%`)
  for (const deal of deals ?? []) {
    await admin.from('supplier_charges').delete().eq('deal_id', deal.id)
    await admin.from('continuous_payouts').delete().eq('deal_id', deal.id)
    await admin.from('deal_events').delete().eq('deal_id', deal.id)
    await admin.from('deal_tasks').delete().eq('deal_id', deal.id)
    await admin.from('deal_items').delete().eq('deal_id', deal.id)
    await admin.from('deals').delete().eq('id', deal.id)
  }
  const { data: services } = await admin.from('services').select('id').like('name', `${PREFIX}%`)
  for (const service of services ?? []) {
    const { data: serviceMenus } = await admin.from('service_menus').select('id').eq('service_id', service.id)
    const serviceMenuIds = (serviceMenus ?? []).map(row => row.id)
    if (serviceMenuIds.length) {
      const { data: menus } = await admin.from('menus').select('id').in('service_menu_id', serviceMenuIds)
      const menuIds = (menus ?? []).map(row => row.id)
      if (menuIds.length) {
        await admin.from('menu_rewards').delete().in('menu_id', menuIds)
        await admin.from('menus').delete().in('id', menuIds)
      }
      await admin.from('service_menus').delete().in('id', serviceMenuIds)
    }
    await admin.from('services').delete().eq('id', service.id)
  }
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const email of Object.values(EMAILS)) {
    const user = users.users.find(candidate => candidate.email === email)
    if (!user) continue
    const { data: partner } = await admin.from('partners').select('id').eq('profile_id', user.id).maybeSingle()
    if (partner) {
      await admin.from('supplier_charges').delete().eq('supplier_partner_id', partner.id)
      await admin.from('supplier_card_events').delete().eq('supplier_partner_id', partner.id)
      await admin.from('partners').update({ frontier_id: null }).eq('frontier_id', partner.id)
      await admin.from('partners').delete().eq('id', partner.id)
    }
    await admin.from('audit_logs').delete().eq('actor_profile_id', user.id).then(() => {}, () => {})
    await admin.from('profiles').delete().eq('id', user.id)
    await admin.auth.admin.deleteUser(user.id)
  }
}

async function makeUser(email: string, name: string, role: string) {
  const created = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, app_metadata: { role } })
  if (!created.data.user) throw new Error(`auth user create failed: ${email}`)
  await admin.from('profiles').upsert({ id: created.data.user.id, name, email, role, color: '#888888' })
  return created.data.user.id
}

async function login(page: Page, base: string, email: string, path: string) {
  await page.goto(base + path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const emailInput = page.locator('input[type="email"]')
  if (!(await emailInput.count())) return
  await emailInput.fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(2600)
}

await cleanup()
if (CLEANUP_ONLY) {
  console.log('SIMPLE-FEE-1 CLEANUP: done')
  process.exit(0)
}
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
try {
  const ownerUid = await makeUser(EMAILS.owner, `${PREFIX}運営`, 'owner')
  const supplierUid = await makeUser(EMAILS.supplier, `${PREFIX}供給`, 'partner')
  const outsiderUid = await makeUser(EMAILS.outsider, `${PREFIX}他系統`, 'partner')
  const insiderUid = await makeUser(EMAILS.insider, `${PREFIX}同系統`, 'partner')
  const supplierId = (await admin.from('partners').insert({ profile_id: supplierUid, code: 'CSF101', company_name: `${PREFIX}株式会社`, is_frontier: true, supplier_rate_card: 'omnis-founding-v1', tax_type: 'corporate', status: 'active' }).select('id').single()).data!.id
  const outsiderId = (await admin.from('partners').insert({ profile_id: outsiderUid, code: 'CSF102' }).select('id').single()).data!.id
  const insiderId = (await admin.from('partners').insert({ profile_id: insiderUid, code: 'CSF103', frontier_id: supplierId }).select('id').single()).data!.id
  const serviceId = (await admin.from('services').insert({ name: `${PREFIX}ブランド`, active: true, supplier_partner_id: supplierId, icon: '🧪', color: '#4733E6' }).select('id').single()).data!.id
  const serviceMenuId = (await admin.from('service_menus').insert({ service_id: serviceId, name: `${PREFIX}メニュー`, ref_type: 'fixed', ref_value: 10000 }).select('id').single()).data!.id
  const menuId = (await admin.from('menus').insert({ service_menu_id: serviceMenuId, name: `${PREFIX}メニュー`, active: true }).select('id').single()).data!.id
  await admin.from('menu_rewards').insert({ menu_id: menuId, reward_type: 'fixed', reward_value: 10000, active: true })

  const halfSnapshot = await resolveFeeSnapshot(admin as never, { partnerId: outsiderId, serviceId })
  const selfSnapshot = await resolveFeeSnapshot(admin as never, { partnerId: insiderId, serviceId })
  ok(halfSnapshot?.rate_kind === 'half_commission' && halfSnapshot.rate === 0.5, '① 他系統→折半カードメニュー = half_commission 50%', JSON.stringify(halfSnapshot))
  ok(selfSnapshot?.rate_kind === 'payment_fee_5' && selfSnapshot.rate === 0.05 && selfSnapshot.rate_card_version === 'omnis-founding-v1', '② 同系統→自社メニュー = payment_fee_5 5%（オムニスカード）', JSON.stringify(selfSnapshot))

  const ym = new Date().toISOString().slice(0, 7)
  const halfDealId = (await admin.from('deals').insert({ partner_id: outsiderId, service_id: serviceId, menu_id: serviceMenuId, customer_name: `${PREFIX}折半`, channel: 'cooperation', source: 'partner_form', consent: true, status: 'confirmed', amount: 10000, fixed_month: `${ym}-01`, fee_snapshot: halfSnapshot }).select('id').single()).data!.id
  await admin.from('deal_items').insert({ deal_id: halfDealId, service_id: serviceId, kind: 'fixed', amount: 10000, revenue: 200000, sort: 0 })
  const selfDealId = (await admin.from('deals').insert({ partner_id: insiderId, service_id: serviceId, menu_id: serviceMenuId, customer_name: `${PREFIX}決済`, channel: 'cooperation', source: 'partner_form', consent: true, status: 'confirmed', amount: 10000, fixed_month: `${ym}-01`, fee_snapshot: selfSnapshot }).select('id').single()).data!.id
  await admin.from('deal_items').insert({ deal_id: selfDealId, service_id: serviceId, kind: 'fixed', amount: 10000, revenue: 100000, sort: 0 })

  const preview = await computeCharges(admin as never, supplierId, ym)
  const kinds = preview.rows.map(row => row.kind)
  ok(preview.rows.every(row => row.deal_id != null), '③ 月次クローズpreviewに案件外の固定行なし', JSON.stringify(preview.rows))
  ok(preview.rows.some(row => row.kind === 'half_commission' && row.amount === 100000), '折半額 = 200,000×50%')
  ok(preview.rows.some(row => row.kind === 'payment_fee_5' && row.amount === 500), '決済額 = 10,000×5%')

  writeFileSync('/tmp/simple-fee1-fixture.json', JSON.stringify({ supplierId, owner: EMAILS.owner, supplier: EMAILS.supplier, password: PASSWORD }))

  if (!NO_BROWSER) {
  browser = await launchChromium(chromium)
  const consoleContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const consolePage = await consoleContext.newPage()
  await login(consolePage, CONSOLE_BASE, EMAILS.owner, '/console/login')
  await consolePage.goto(`${CONSOLE_BASE}/console/suppliers`, { waitUntil: 'domcontentloaded' })
  await consolePage.waitForTimeout(1800)
  const consoleText = await consolePage.locator('main,body').first().innerText()
  ok(!consoleText.includes('月額'), 'console suppliersから旧固定料金表記消滅', consoleText)
  await consolePage.screenshot({ path: `${SHOTS}/after-console-suppliers.png`, fullPage: true })
  await consolePage.goto(`${CONSOLE_BASE}/console/suppliers/${supplierId}`, { waitUntil: 'domcontentloaded' })
  await consolePage.waitForTimeout(1800)
  const detailText = await consolePage.locator('main,body').first().innerText()
  ok(detailText.includes('折半（オムニス等の個別契約）') && detailText.includes('標準（パススルー＋受注額5%）') && !detailText.includes('月額'), 'レートカード説明 = 折半／標準の2行文法', detailText)
  await consolePage.screenshot({ path: `${SHOTS}/after-rate-card.png`, fullPage: true })

  const supplierPage = await consoleContext.newPage()
  await supplierPage.setViewportSize({ width: 375, height: 667 })
  await login(supplierPage, APP_BASE, EMAILS.supplier, '/login')
  await supplierPage.goto(`${APP_BASE}/app/s/money`, { waitUntil: 'domcontentloaded' })
  await supplierPage.waitForTimeout(1800)
  const moneyText = await supplierPage.locator('main,body').first().innerText()
  ok(!moneyText.includes('月額') && moneyText.includes('決済手数料'), '④ supplier moneyから固定料金表記消滅・決済手数料表示', moneyText)
  const dims = await supplierPage.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }))
  ok(dims.scrollWidth <= 375 && dims.clientWidth === 375, '375px水平溢れゼロ', JSON.stringify(dims))
  await supplierPage.screenshot({ path: `${SHOTS}/after-supplier-money-375.png`, fullPage: true })
  ok(ownerUid.length > 0, 'fixture owner作成')
  }
} finally {
  if (browser) await browser.close()
  if (!KEEP_FIXTURE) await cleanup()
}

if (!KEEP_FIXTURE) {
  const { count: residueDeals } = await admin.from('deals').select('id', { count: 'exact', head: true }).like('customer_name', `${PREFIX}%`)
  const { count: residueServices } = await admin.from('services').select('id', { count: 'exact', head: true }).like('name', `${PREFIX}%`)
  const { data: residueUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const residueAuth = residueUsers.users.filter(user => Object.values(EMAILS).includes(user.email as never)).length
  ok(residueDeals === 0 && residueServices === 0 && residueAuth === 0, 'throwaway残置0', JSON.stringify({ residueDeals, residueServices, residueAuth }))
}
console.log(`SIMPLE-FEE-1: ${pass}/${pass + fail}`)
if (fail) process.exit(1)
