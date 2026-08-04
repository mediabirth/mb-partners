/** EXP-1 action timing / motion proof. Throwaway-only; run with CC_MAIL_SUPPRESS=1. */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Page } from 'playwright'
import { launchChromium } from './verification/playwright-launch.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const at = line.indexOf('='); return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = process.env.BASE_APP || 'http://localhost:4599'
const EMAIL = 'cc-exp1-vendor@mb-system.internal'
const PASSWORD = 'CcExp1!2026xx'
const PREFIX = 'CCEXP1-'
let fixtureAssignmentId = ''
let pass = 0; let fail = 0
const ok = (condition: boolean, label: string, detail = '') => condition
  ? (pass++, console.log(`  ✓ ${label}`))
  : (fail++, console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`))

async function cleanup() {
  const { data: deals } = await admin.from('deals').select('id').like('customer_name', `${PREFIX}%`)
  const dealIds = (deals ?? []).map(row => row.id)
  if (dealIds.length) {
    const { data: assignments } = await admin.from('delivery_assignments').select('id').in('deal_id', dealIds)
    const assignmentIds = (assignments ?? []).map(row => row.id)
    if (assignmentIds.length) {
      await admin.from('expense_claims').delete().in('delivery_assignment_id', assignmentIds)
      await admin.from('delivery_assignments').delete().in('id', assignmentIds)
    }
    await admin.from('deals').delete().in('id', dealIds)
  }
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const user of users.users.filter(item => item.email === EMAIL)) {
    await admin.from('deliveries').delete().eq('auth_user_id', user.id)
    await admin.from('partners').delete().eq('profile_id', user.id)
    await admin.from('profiles').delete().eq('id', user.id)
    await admin.auth.admin.deleteUser(user.id)
  }
}

async function fixture() {
  const created = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true, app_metadata: { role: 'vendor' } })
  if (!created.data.user) throw created.error || new Error('vendor auth fixture failed')
  const userId = created.data.user.id
  const profile = await admin.from('profiles').insert({ id: userId, name: 'CC-EXP1委託先', email: EMAIL, role: 'vendor', color: '#777777' })
  if (profile.error) throw profile.error
  const delivery = await admin.from('deliveries').insert({ name: 'CC-EXP1屋号', contact_email: EMAIL, auth_user_id: userId, active: true }).select('id').single()
  if (!delivery.data) throw delivery.error || new Error('delivery fixture failed')
  const partner = await admin.from('partners').insert({ profile_id: userId, code: 'CCEXP1', status: 'active' }).select('id').single()
  if (!partner.data) throw partner.error || new Error('partner fixture failed')
  const deal = await admin.from('deals').insert({
    partner_id: partner.data.id, service_id: null, menu_id: null, customer_name: `${PREFIX}EXPENSE`,
    channel: 'referral', source: 'admin_manual', status: 'in_progress', amount: 0,
    reward_snapshot: null, consent: true, created_by: userId,
  }).select('id').single()
  if (!deal.data) throw deal.error || new Error('deal fixture failed')
  const assignment = await admin.from('delivery_assignments').insert({
    deal_id: deal.data.id, delivery_id: delivery.data.id, base_fee: 0, status: 'assigned', assigned_by: userId,
  }).select('id').single()
  if (!assignment.data) throw assignment.error || new Error('assignment fixture failed')
  fixtureAssignmentId = assignment.data.id
}

async function login(page: Page) {
  await page.goto(`${BASE}/vendor/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1200)
  const email = page.locator('input[type="email"]')
  const password = page.locator('input[type="password"]')
  await email.fill(EMAIL); await password.fill(PASSWORD)
  if ((await email.inputValue()) !== EMAIL) await email.fill(EMAIL)
  await page.locator('button[type="submit"]').click()
  await page.waitForURL(/\/vendor(?:\/|$)/, { timeout: 30_000 })
}

await cleanup()
const browser = await launchChromium({ headless: true })
try {
  await fixture()
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const page = await context.newPage()
  await login(page)
  await page.getByRole('button', { name: '経費を申請' }).click()
  const sheet = page.getByRole('dialog', { name: '経費を申請' })
  await sheet.waitFor()
  await sheet.getByPlaceholder('例：15000').fill('1200')
  const startedAt = performance.now()
  await sheet.getByRole('button', { name: '申請する' }).click()
  await sheet.locator('[data-action-state="pending"]').waitFor({ timeout: 1000 })
  const pendingMs = Math.round(performance.now() - startedAt)
  console.log(`[EXP1_UI] expense_pending_ms=${pendingMs}`)
  ok(pendingMs <= 50, '経費ボタンpendingが50ms以内', `${pendingMs}ms`)
  await sheet.locator('[data-action-state="success"]').waitFor({ timeout: 30_000 })
  await sheet.waitFor({ state: 'detached', timeout: 30_000 })
  console.log(`[EXP1_UI] expense_ms=${Math.round(performance.now() - startedAt)}`)
  const ownClaims = await admin.from('expense_claims').select('id, amount').eq('delivery_assignment_id', fixtureAssignmentId)
  ok((ownClaims.data ?? []).length === 1 && Number(ownClaims.data?.[0]?.amount) === 1200, '経費申請がサーバ確定後に完了')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  const animation = await page.evaluate(() => {
    const el = document.createElement('span'); el.className = 'status-pulse-once'; document.body.appendChild(el)
    const duration = getComputedStyle(el).animationDuration; el.remove(); return duration
  })
  ok(animation === '0.00001s' || animation === '0.01ms' || animation === '1e-05s', 'reduced-motionで一回演出を実質停止', animation)
  await context.close()
} finally {
  await browser.close().catch(() => {})
  await cleanup()
  const { data: residue } = await admin.from('deals').select('id').like('customer_name', `${PREFIX}%`)
  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ok((residue ?? []).length === 0 && !users.users.some(item => item.email === EMAIL), 'EXP-1 fixture残置ゼロ')
}

console.log(`\nEXP-1 E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
