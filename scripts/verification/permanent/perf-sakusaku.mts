/**
 * 恒久性能ゲート: throwaway 3面のwarm遷移と押下feedbackを実測する。
 * 禁止: cc-monitor、実ユーザー、既存デモアカウントの参照。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(line => line.includes('='))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = process.env.BASE_APP || 'http://localhost:4599'
const PW = 'CcPermanentPerf!2026'
const ACC = {
  console: { email: 'cc-permanent-perf-owner@mb-system.internal', role: 'owner', name: '恒久性能A' },
  app: { email: 'cc-permanent-perf-partner@mb-system.internal', role: 'partner', name: '恒久性能P' },
  vendor: { email: 'cc-permanent-perf-vendor@mb-system.internal', role: 'vendor', name: '恒久性能V' },
} as const

async function cleanup() {
  const { data: list } = await admin.auth.admin.listUsers()
  for (const account of Object.values(ACC)) {
    const user = (list?.users || []).find(user => user.email === account.email)
    if (!user) continue
    await admin.from('deliveries').delete().eq('auth_user_id', user.id).then(() => {}, () => {})
    await admin.from('partners').delete().eq('profile_id', user.id).then(() => {}, () => {})
    await admin.from('profiles').delete().eq('id', user.id).then(() => {}, () => {})
    await admin.auth.admin.deleteUser(user.id).catch(() => {})
  }
}

async function setup() {
  await cleanup()
  for (const account of Object.values(ACC)) {
    const created = await admin.auth.admin.createUser({
      email: account.email,
      password: PW,
      email_confirm: true,
      app_metadata: { role: account.role },
    })
    if (created.error || !created.data.user) throw created.error || new Error(`createUser failed: ${account.email}`)
    const id = created.data.user.id
    await admin.from('profiles').upsert({ id, name: account.name, role: account.role, email: account.email, color: '#888888' })
    if (account.role === 'partner') {
      await admin.from('partners').insert({ profile_id: id, code: 'CCPERFP', status: 'active' })
    }
    if (account.role === 'vendor') {
      await admin.from('deliveries').insert({
        name: '恒久性能委託先',
        kind: 'エンジニア',
        active: true,
        service_id: 'dx',
        auth_user_id: id,
      })
    }
  }
}

async function login(page: Page, email: string, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(PW)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(2_500)
}

async function measure(page: Page, link: string, targetPath: string, readyText: string) {
  const anchor = page.locator(link).first()
  if (!(await anchor.count())) return { skeleton: -1, operable: -1, feedback: -1 }
  const feedback = await anchor.evaluate(async element => {
    const before = getComputedStyle(element).transform
    const started = performance.now()
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    await new Promise(requestAnimationFrame)
    const changed = getComputedStyle(element).transform !== before
    element.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    return changed ? Math.round(performance.now() - started) : -1
  })
  const started = Date.now()
  await anchor.click()
  await page.waitForURL(url => url.pathname === targetPath, { timeout: 10_000 })
  const skeleton = Date.now() - started
  await page.getByText(readyText, { exact: false }).first().waitFor({ state: 'visible', timeout: 10_000 })
  return { skeleton, operable: Date.now() - started, feedback }
}

const rows: Array<{ surface: string; skeleton: number; operable: number; feedback: number }> = []
const browser = await chromium.launch()
try {
  await setup()
  for (const scenario of [
    { surface: 'console', account: ACC.console, start: '/console', link: 'a[href="/console/deals"]', target: '/console/deals', ready: '案件' },
    { surface: 'app', account: ACC.app, start: '/app', link: 'a[href="/app/refer"]', target: '/app/refer', ready: '紹介をはじめる' },
    { surface: 'vendor', account: ACC.vendor, start: '/vendor', link: 'a[href="/vendor/money"]', target: '/vendor/money', ready: '報酬' },
  ] as const) {
    const context = await browser.newContext({ serviceWorkers: 'block' })
    const page = await context.newPage()
    await login(page, scenario.account.email, scenario.start)
    rows.push({ surface: scenario.surface, ...await measure(page, scenario.link, scenario.target, scenario.ready) })
    await context.close()
  }
} finally {
  await browser.close()
  await cleanup()
}

console.table(rows)
const invalid = rows.filter(row => row.skeleton < 0 || row.operable < 0 || row.feedback < 0)
const overBudget = rows.filter(row => row.skeleton > 100 || row.operable > 500 || row.feedback > 100)
console.log(`PERF: ${rows.length - invalid.length - overBudget.length} green / ${invalid.length} invalid / ${overBudget.length} over budget`)
process.exit(invalid.length || overBudget.length ? 1 : 0)
