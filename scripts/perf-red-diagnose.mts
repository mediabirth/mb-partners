/**
 * バッチ固有診断: app遷移3時点・vendor TTFBを分解する。恒久スイートには登録しない。
 * 実データ非接触。既知throwaway 2件だけを作成しfinallyで撤去する。
 */
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import type { BrowserContext, Page, Request } from 'playwright'
import { launchChromium } from './verification/playwright-launch.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(line => line.includes('='))
  .map(line => { const i = line.indexOf('='); return [line.slice(0, i).trim(), line.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = process.env.BASE_APP || 'http://localhost:4599'
const PW = 'CcPerfRedDiag!2026'
const ACC = {
  app: { email: 'cc-perf-red-app@mb-system.internal', role: 'partner', name: '性能診断P' },
  vendor: { email: 'cc-perf-red-vendor@mb-system.internal', role: 'vendor', name: '性能診断V' },
} as const

async function cleanup() {
  const { data: list } = await admin.auth.admin.listUsers()
  for (const account of Object.values(ACC)) {
    const user = (list?.users || []).find(candidate => candidate.email === account.email)
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
    if (account.role === 'partner') await admin.from('partners').insert({ profile_id: id, code: 'CCPRDA', status: 'active' })
    if (account.role === 'vendor') {
      await admin.from('deliveries').insert({ name: '性能診断委託先', kind: 'エンジニア', active: true, service_id: 'dx', auth_user_id: id })
    }
  }
}

async function login(page: Page, email: string, path: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.readyState === 'complete')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(PW)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForTimeout(2_500)
}

function isRsc(request: Request): boolean {
  const headers = request.headers()
  return headers.rsc === '1' || request.url().includes('_rsc=')
}

async function routeTimeline(page: Page, input: { start: string; link: string; target: string; ready: string }) {
  await page.goto(`${BASE}${input.start}`, { waitUntil: 'domcontentloaded' })
  await page.locator(input.link).first().waitFor({ state: 'visible' })
  await page.waitForTimeout(500)
  const anchor = page.locator(input.link).first()
  const started = performance.now()
  let requestAt = -1
  let responseAt = -1
  let responseDoneAt = -1
  let clickResolvedAt = -1
  const onRequest = (request: Request) => {
    if (isRsc(request) && requestAt < 0) requestAt = performance.now() - started
  }
  page.on('request', onRequest)
  page.on('response', response => {
    if (!isRsc(response.request()) || responseAt >= 0) return
    responseAt = performance.now() - started
    void response.finished().then(() => { responseDoneAt = performance.now() - started }).catch(() => {})
  })
  await page.evaluate(({ target, ready }) => {
    const state = window as typeof window & { __perfSamples?: unknown[]; __perfTimer?: number }
    state.__perfSamples = []
    const sampleStart = performance.now()
    state.__perfTimer = window.setInterval(() => {
      const animations = [...document.getAnimations()].map(animation => ({
        playState: animation.playState,
        duration: Math.round(Number((animation.effect?.getTiming().duration ?? -1))),
      }))
      state.__perfSamples?.push({
        ms: Math.round(performance.now() - sampleStart),
        path: location.pathname,
        busy: document.querySelectorAll('[aria-busy="true"]').length,
        ready: document.body.innerText.includes(ready),
        animations,
      })
      if (location.pathname === target && document.body.innerText.includes(ready)) window.clearInterval(state.__perfTimer)
    }, 25)
  }, { target: input.target, ready: input.ready })
  const history = page.waitForURL(url => url.pathname === input.target, { timeout: 10_000 }).then(() => performance.now() - started)
  const loading = page.locator('[aria-busy="true"]').first().waitFor({ state: 'visible', timeout: 1_000 })
    .then(() => performance.now() - started).catch(() => -1)
  const pageAnim = page.locator('.page-anim').first().waitFor({ state: 'visible', timeout: 3_000 })
    .then(async () => ({
      at: performance.now() - started,
      animation: await page.locator('.page-anim').first().evaluate(element => {
        const style = getComputedStyle(element)
        return { name: style.animationName, duration: style.animationDuration }
      }),
    })).catch(() => ({ at: -1, animation: { name: '', duration: '' } }))
  await anchor.click({ noWaitAfter: true })
  clickResolvedAt = performance.now() - started
  const historyAt = await history
  await page.getByRole('heading', { name: input.ready, exact: true }).waitFor({ state: 'visible', timeout: 10_000 })
  const readyAt = performance.now() - started
  const samples = await page.evaluate(() => {
    const state = window as typeof window & { __perfSamples?: unknown[]; __perfTimer?: number }
    if (state.__perfTimer) window.clearInterval(state.__perfTimer)
    const list = (state.__perfSamples ?? []) as Array<{ ms: number; path: string; busy: number; ready: boolean; animations: unknown[] }>
    return list.filter((sample, index) => {
      if (index === 0 || index === list.length - 1) return true
      const previous = list[index - 1]
      return sample.path !== previous.path
        || sample.busy !== previous.busy
        || sample.ready !== previous.ready
        || JSON.stringify(sample.animations) !== JSON.stringify(previous.animations)
    })
  })
  const [loadingAt, animation] = await Promise.all([loading, pageAnim])
  await page.waitForTimeout(50)
  page.off('request', onRequest)
  return {
    historyMs: Math.round(historyAt),
    clickResolvedMs: Math.round(clickResolvedAt),
    loadingMs: Math.round(loadingAt),
    rscRequestMs: Math.round(requestAt),
    rscResponseMs: Math.round(responseAt),
    rscFinishedMs: Math.round(responseDoneAt),
    readyMs: Math.round(readyAt),
    pageAnimAtMs: Math.round(animation.at),
    pageAnim: animation.animation,
    samples,
  }
}

function curlTtfb(context: BrowserContext, path: string) {
  return context.cookies(BASE).then(cookies => {
    const header = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
    const result = spawnSync('curl', [
      '-sS', '-o', '/dev/null', '-w', '%{http_code} %{time_starttransfer} %{time_total}',
      '-H', `Cookie: ${header}`,
      '-H', 'Cache-Control: no-cache',
      `${BASE}${path}?diag=${Date.now()}`,
    ], { encoding: 'utf8' })
    if (result.status !== 0) throw new Error(result.stderr || `curl exit ${result.status}`)
    return result.stdout.trim()
  })
}

const browser = await launchChromium()
const context = await browser.newContext({ serviceWorkers: 'block' })
try {
  await setup()
  const page = await context.newPage()
  await login(page, ACC.app.email, '/app')
  const app = []
  for (let i = 0; i < 3; i++) app.push(await routeTimeline(page, {
    start: '/app',
    link: 'a[href="/app/refer"]',
    target: '/app/refer',
    ready: '紹介をはじめる',
  }))
  console.log(JSON.stringify({ mode: process.env.DIAG_MODE ?? 'default', app }, null, 2))

  await context.clearCookies()
  await login(page, ACC.vendor.email, '/vendor')
  const vendor = []
  for (let i = 0; i < 3; i++) vendor.push(await routeTimeline(page, {
    start: '/vendor',
    link: 'a[href="/vendor/rewards"]',
    target: '/vendor/rewards',
    ready: '委託費の明細',
  }))
  console.log(JSON.stringify({
    mode: process.env.DIAG_MODE ?? 'default',
    vendor,
    vendorCurl: [
      await curlTtfb(context, '/vendor/rewards'),
      await curlTtfb(context, '/vendor/rewards'),
      await curlTtfb(context, '/vendor/rewards'),
    ],
  }, null, 2))
  await page.close()
} finally {
  await context.close().catch(() => {})
  await browser.close().catch(() => {})
  await cleanup()
}
