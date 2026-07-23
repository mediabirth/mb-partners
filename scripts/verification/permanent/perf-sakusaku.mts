/**
 * 恒久性能ゲート: throwaway 3面のwarm遷移と押下feedbackを実測する。
 * 禁止: cc-monitor、実ユーザー、既存デモアカウントの参照。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Page } from 'playwright'
import { launchChromium } from '../playwright-launch.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(line => line.includes('='))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const APP_BASE = process.env.BASE_APP || 'http://localhost:4599'
const CONSOLE_BASE = process.env.BASE_CONSOLE || APP_BASE
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

async function login(page: Page, base: string, email: string, path: string) {
  await page.goto(`${base}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.readyState === 'complete')
  const emailInput = page.locator('input[type="email"]')
  const passwordInput = page.locator('input[type="password"]')
  await emailInput.waitFor({ state: 'visible' })
  await passwordInput.waitFor({ state: 'visible' })
  for (let attempt = 0; attempt < 3; attempt++) {
    await emailInput.fill(email)
    await passwordInput.fill(PW)
    await page.waitForTimeout(100)
    if (await emailInput.inputValue() === email && await passwordInput.inputValue() === PW) break
  }
  if (await emailInput.inputValue() !== email || await passwordInput.inputValue() !== PW) {
    throw new Error(`login hydration did not retain credentials: ${path}`)
  }
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(2_500)
}

async function waitForReady(page: Page, readySelector: string, readyText: string) {
  await page.waitForFunction(({ selector, text }) => {
    return [...document.querySelectorAll<HTMLElement>(selector)].some(element => {
      const rect = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return element.textContent?.trim() === text
        && rect.width > 0
        && rect.height > 0
        && style.display !== 'none'
        && style.visibility !== 'hidden'
    })
  }, { selector: readySelector, text: readyText }, { timeout: 10_000, polling: 'raf' })
}

async function warmUp(page: Page, link: string, targetPath: string, readySelector: string, readyText: string, startPath: string) {
  await page.locator(link).first().click()
  await page.waitForURL(url => url.pathname === targetPath, { timeout: 10_000 })
  await waitForReady(page, readySelector, readyText)
  await page.locator(`a[href="${startPath}"]`).first().click()
  await page.waitForURL(url => url.pathname === startPath, { timeout: 10_000 })
  await page.locator(link).first().waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(500)
}

async function measure(page: Page, link: string, targetPath: string, readySelector: string, readyText: string) {
  const anchor = page.locator(link).first()
  if (!(await anchor.count())) return { skeleton: -1, operable: -1, feedback: -1 }
  const box = await anchor.boundingBox()
  if (!box) return { skeleton: -1, operable: -1, feedback: -1 }
  await page.mouse.move(0, 0)
  const before = await anchor.evaluate(element => getComputedStyle(element).transform)
  const feedbackStarted = Date.now()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(20)
  const after = await anchor.evaluate(element => getComputedStyle(element).transform)
  const feedback = after !== before ? Date.now() - feedbackStarted : -1
  // 実ジェスチャーどおり同じリンク上でmouse-upし、そのclickを遷移計測に使う。
  // feedback検査後に別clickすると、:active復帰transitionの安定待ちが遷移時間へ混入する。
  const started = Date.now()
  const targetReached = page.waitForURL(url => url.pathname === targetPath, { timeout: 10_000 }).then(() => Date.now() - started)
  const skeletonShown = page.locator('[aria-busy="true"]').first()
    .waitFor({ state: 'visible', timeout: 2_000 })
    .then(() => Date.now() - started)
    .catch(() => Number.POSITIVE_INFINITY)
  await page.mouse.up()
  const skeleton = await Promise.race([skeletonShown, targetReached])
  await targetReached
  await waitForReady(page, readySelector, readyText)
  return { skeleton, operable: Date.now() - started, feedback }
}

const rows: Array<{ surface: string; skeleton: number; operable: number; feedback: number }> = []
const browser = await launchChromium()
const anchorContext = await browser.newContext()
try {
  await setup()
  for (const scenario of [
    { surface: 'console', base: CONSOLE_BASE, account: ACC.console, start: '/console', link: 'a[href="/console/deals"]', target: '/console/deals', readySelector: 'h1', ready: '案件ボード' },
    { surface: 'app', base: APP_BASE, account: ACC.app, start: '/app', link: 'a[href="/app/refer"]', target: '/app/refer', readySelector: 'h2', ready: '紹介をはじめる' },
    { surface: 'vendor', base: APP_BASE, account: ACC.vendor, start: '/vendor', link: 'a[href="/vendor/rewards"]', target: '/vendor/rewards', readySelector: 'h2', ready: '委託費の明細' },
  ] as const) {
    const context = anchorContext
    await context.clearCookies()
    const page = await context.newPage()
    await login(page, scenario.base, scenario.account.email, scenario.start)
    await warmUp(page, scenario.link, scenario.target, scenario.readySelector, scenario.ready, scenario.start)
    rows.push({ surface: scenario.surface, ...await measure(page, scenario.link, scenario.target, scenario.readySelector, scenario.ready) })
    await page.close()
  }
} finally {
  await anchorContext.close().catch(() => {})
  await browser.close()
  await cleanup()
}

console.table(rows)
const invalid = rows.filter(row => row.skeleton < 0 || row.operable < 0 || row.feedback < 0)
const overBudget = rows.filter(row => row.skeleton > 100 || row.operable > 500 || row.feedback > 100)
console.log(`PERF: ${rows.length - invalid.length - overBudget.length} green / ${invalid.length} invalid / ${overBudget.length} over budget`)
process.exit(invalid.length || overBudget.length ? 1 : 0)
