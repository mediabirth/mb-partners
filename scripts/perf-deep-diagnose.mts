/**
 * perf-deep バッチ固有計測。
 * throwaway 20案件を作り、Server-Timing（各5回の中央値）を採取して必ず撤去する。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { APIRequestContext, BrowserContext, Page } from 'playwright'
import { launchChromium } from './verification/playwright-launch.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(line => line.includes('='))
  .map(line => { const index = line.indexOf('='); return [line.slice(0, index).trim(), line.slice(index + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const BASE = process.env.BASE_APP || 'http://localhost:4599'
const PASSWORD = 'PerfDeep!2026xx'
const FIXTURE = {
  owner: 'cc-perf-deep-owner@mb-system.internal',
  partner: 'cc-perf-deep-partner@mb-system.internal',
  vendor: 'cc-perf-deep-vendor@mb-system.internal',
  service: 'CC-PERF-DEEPブランド',
  customerPrefix: 'CCPD1-',
}

async function fixtureUsers() {
  const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return (data?.users ?? []).filter(user => Object.values(FIXTURE).includes(user.email ?? ''))
}

async function cleanup() {
  const { data: deals } = await admin.from('deals').select('id').like('customer_name', `${FIXTURE.customerPrefix}%`)
  const dealIds = (deals ?? []).map(deal => deal.id)
  if (dealIds.length) {
    const { data: assignments } = await admin.from('delivery_assignments').select('id').in('deal_id', dealIds)
    const assignmentIds = (assignments ?? []).map(row => row.id)
    if (assignmentIds.length) {
      await admin.from('expense_claims').delete().in('delivery_assignment_id', assignmentIds)
      await admin.from('delivery_tasks').delete().in('delivery_assignment_id', assignmentIds)
      await admin.from('delivery_updates').delete().in('delivery_assignment_id', assignmentIds)
      await admin.from('delivery_deliverables').delete().in('delivery_assignment_id', assignmentIds)
    }
    await admin.from('delivery_assignments').delete().in('deal_id', dealIds)
    await admin.from('deal_events').delete().in('deal_id', dealIds)
    await admin.from('deal_items').delete().in('deal_id', dealIds)
    await admin.from('deals').delete().in('id', dealIds)
  }
  await admin.from('services').delete().eq('name', FIXTURE.service)
  for (const user of await fixtureUsers()) {
    await admin.from('deliveries').delete().eq('auth_user_id', user.id)
    await admin.from('partners').delete().eq('profile_id', user.id)
    await admin.from('profiles').delete().eq('id', user.id)
    await admin.auth.admin.deleteUser(user.id)
  }
}

async function createUser(email: string, role: string, name: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, app_metadata: { role } })
  if (error || !data.user) throw error ?? new Error(`create user failed: ${email}`)
  await admin.from('profiles').insert({ id: data.user.id, email, role, name, color: '#888888' })
  return data.user.id
}

async function setup() {
  await cleanup()
  const ownerId = await createUser(FIXTURE.owner, 'owner', '性能計測運営')
  const partnerUid = await createUser(FIXTURE.partner, 'partner', '性能計測紹介者')
  const vendorUid = await createUser(FIXTURE.vendor, 'vendor', '性能計測委託先')
  const { data: partner, error: partnerError } = await admin.from('partners')
    .insert({ profile_id: partnerUid, code: 'CCPD01', status: 'active' }).select('id').single()
  if (partnerError || !partner) throw partnerError ?? new Error('partner fixture failed')
  const { data: delivery, error: deliveryError } = await admin.from('deliveries')
    .insert({ auth_user_id: vendorUid, name: '性能計測委託先', kind: 'エンジニア', active: true })
    .select('id').single()
  if (deliveryError || !delivery) throw deliveryError ?? new Error('delivery fixture failed')
  const { data: service, error: serviceError } = await admin.from('services')
    .insert({ name: FIXTURE.service, active: true, icon: '🧪', color: '#4733E6' }).select('id').single()
  if (serviceError || !service) throw serviceError ?? new Error('service fixture failed')
  const { data: deals, error: dealsError } = await admin.from('deals').insert(
    Array.from({ length: 20 }, (_, index) => ({
      partner_id: partner.id,
      service_id: service.id,
      customer_name: `${FIXTURE.customerPrefix}${String(index + 1).padStart(2, '0')}`,
      channel: 'referral',
      source: 'partner_form',
      consent: true,
      status: 'received',
      amount: 0,
    })),
  ).select('id')
  if (dealsError || deals?.length !== 20) throw dealsError ?? new Error('20 deals fixture failed')
  const { error: assignmentsError } = await admin.from('delivery_assignments').insert(
    deals.map(deal => ({ deal_id: deal.id, delivery_id: delivery.id, base_fee: 0, status: 'accepted' })),
  )
  if (assignmentsError) throw assignmentsError
  return { ownerId }
}

async function login(context: BrowserContext, email: string, path: string): Promise<Page> {
  const page = await context.newPage()
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.readyState === 'complete')
  const emailInput = page.locator('input[type="email"]')
  if (await emailInput.count()) {
    await emailInput.fill(email)
    await page.locator('input[type="password"]').fill(PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.waitForTimeout(2200)
  }
  return page
}

type Sample = { ms: number; timing: string; status: number }
function median(samples: Sample[]): Sample {
  return [...samples].sort((a, b) => a.ms - b.ms)[Math.floor(samples.length / 2)]
}
async function sample(request: APIRequestContext, path: string): Promise<Sample> {
  const started = performance.now()
  const response = await request.get(BASE + path, { headers: { 'Cache-Control': 'no-store' } })
  return {
    ms: Math.round(performance.now() - started),
    timing: response.headers()['server-timing'] ?? '(missing)',
    status: response.status(),
  }
}
async function five(request: APIRequestContext, path: string) {
  await sample(request, path)
  const samples = await Promise.all(Array.from({ length: 5 }, () => sample(request, path)))
  return median(samples)
}

let browser
try {
  await setup()
  browser = await launchChromium()
  // Codex sandboxのsingle-process fallbackでは複数contextを同時生成しない。
  const context = await browser.newContext()
  const ownerPage = await login(context, FIXTURE.owner, '/console')
  const dealsProbe = await context.request.get(BASE + '/api/console/deals', { headers: { 'Cache-Control': 'no-store' } })
  const dealsBody = await dealsProbe.json() as { deals?: Array<{ customer_name?: string }> }
  const fixtureDealNames = (dealsBody.deals ?? []).filter(deal => deal.customer_name?.startsWith(FIXTURE.customerPrefix))
  if (fixtureDealNames.length !== 20) throw new Error(`console result mismatch: ${fixtureDealNames.length}/20`)
  const rows = [
    { target: '/api/console/deals', ...await five(context.request, '/api/console/deals') },
    { target: '/api/console/payouts', ...await five(context.request, '/api/console/payouts') },
  ]
  await ownerPage.close()
  await context.clearCookies()
  const vendorPage = await login(context, FIXTURE.vendor, '/vendor')
  const vendorProbe = await context.request.get(BASE + '/api/vendor/rewards-timing', { headers: { 'Cache-Control': 'no-store' } })
  const vendorBody = await vendorProbe.json() as { assignments?: number }
  if (vendorBody.assignments !== 20) throw new Error(`vendor result mismatch: ${vendorBody.assignments}/20`)
  rows.push({ target: '/api/vendor/rewards-timing', ...await five(context.request, '/api/vendor/rewards-timing') })
  console.table(rows.map(row => ({ target: row.target, status: row.status, medianMs: row.ms })))
  for (const row of rows) console.log(`${row.target}\n  ${row.timing}`)
  console.log('RESULT IDENTITY: console fixture deals=20 / vendor own assignments=20')
  await vendorPage.close()
  await context.close()
} finally {
  await browser?.close().catch(() => {})
  await cleanup()
  const remainingDeals = await admin.from('deals').select('id', { head: true, count: 'exact' }).like('customer_name', `${FIXTURE.customerPrefix}%`)
  const remainingUsers = await fixtureUsers()
  console.log(`PERF-DEEP RESIDUE: deals=${remainingDeals.count ?? -1} auth=${remainingUsers.length}`)
}
