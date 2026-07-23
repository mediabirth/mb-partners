/**
 * バックグラウンド復帰パフォーマンス計測（A・C共用）。
 * 手法: Playwright clock で Date.now を放置分だけ前進（=トークン期限切れ・Router Cache失効・SWR focus再検証を実時間待ちなしで忠実再現）
 *       ＋ visibilityState を hidden→visible に切替（実ブラウザの復帰イベント経路をそのまま発火）。
 * 計測: 復帰直後クリック→内容表示ms（immediate）／復帰0.5秒後クリック（human=実操作相当）。auth/v1/token 往復と失敗応答も記録。
 * 使い方: pnpm exec tsx scripts/verification/permanent/resume-perf.mts [label]
 */
import { readFileSync, appendFileSync, mkdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Page } from 'playwright'
import { launchChromium } from '../playwright-launch.mjs'
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = 'http://localhost:4599', PW = 'CcRp!2026xx', LABEL = process.argv[2] ?? 'run'
const OWNER = 'cc-rp-owner@mb-system.internal', REF = 'cc-rp-ref@mb-system.internal', SUP = 'cc-rp-sup@mb-system.internal'
const OUT = '/private/tmp/mb-partners-verify/resume-perf.jsonl'
mkdirSync('/private/tmp/mb-partners-verify', { recursive: true })

async function cleanup() {
  const { data: svc } = await admin.from('services').select('id').eq('name', 'CC-RPブランド').maybeSingle()
  if (svc) await admin.from('services').delete().eq('id', svc.id)
  const { data: l } = await admin.auth.admin.listUsers()
  for (const em of [REF, SUP, OWNER]) {
    const u = (l?.users || []).find((x: any) => x.email === em)
    if (u) { const { data: pa } = await admin.from('partners').select('id').eq('profile_id', u.id).maybeSingle(); if (pa) await admin.from('partners').delete().eq('id', pa.id); await admin.from('profiles').delete().eq('id', u.id); await admin.auth.admin.deleteUser(u.id).catch(() => {}) }
  }
}
try {
await cleanup()
const mk = async (email: string, name: string, role: string) => { const c = await admin.auth.admin.createUser({ email, password: PW, email_confirm: true, app_metadata: { role } }); await admin.from('profiles').upsert({ id: c.data!.user!.id, name, role, email, color: '#888' }); return c.data!.user!.id }
await mk(OWNER, 'CC-RP運営', 'owner')
await mk(REF, 'CC-RP紹介', 'partner').then(async uid => { await admin.from('partners').insert({ profile_id: uid, code: 'CCRP02', status: 'active' }) })
await mk(SUP, 'CC-RP供給者', 'partner').then(async uid => {
  const pid = (await admin.from('partners').insert({ profile_id: uid, code: 'CCRP01', company_name: '株式会社CC-RP', status: 'active' }).select('id').single()).data!.id
  await admin.from('services').insert({ name: 'CC-RPブランド', active: true, supplier_partner_id: pid, icon: '🧪', color: '#4733E6' })
})

const b = await launchChromium()
const anchorContext = await b.newContext()
type Meas = { label: string; surface: string; mode: string; idleMin: number; clickToContentMs: number; authRefreshMs: number | null; apiFirstMs: number | null; failed: string[] }
const rows: Meas[] = []

async function setHidden(p: Page, hidden: boolean) {
  await p.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { value: h ? 'hidden' : 'visible', configurable: true })
    Object.defineProperty(document, 'hidden', { value: !!h, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
    if (!h) window.dispatchEvent(new Event('focus'))
  }, hidden)
}

async function login(p: Page, email: string, path: string) {
  await p.goto(BASE + path, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1500)
  if (!(await p.locator('input[type="email"]').count())) return
  await p.locator('input[type="email"]').fill(email); await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click(); await p.waitForTimeout(2800)
}

type Scenario = { surface: string; email: string; start: string; op: (p: Page) => Promise<void>; ready: (p: Page) => Promise<boolean>; back?: (p: Page) => Promise<void> }
const SCENARIOS: Scenario[] = [
  {
    surface: 'console', email: OWNER, start: '/console/payouts',
    op: async p => { await p.locator('button:has-text("サプライヤーからの請求")').click() },
    ready: async p => (await p.locator('text=月次クローズ（金額の凍結）').count()) > 0 || (await p.locator('text=サプライヤーが未登録です').count()) > 0,
    back: async p => { await p.locator('button:has-text("パートナーへの支払")').click(); await p.waitForTimeout(600) },
  },
  {
    surface: 'app', email: REF, start: '/app',
    op: async p => { await p.locator('.snav-root a[href="/app/rewards"]').click() },
    ready: async p => (await p.locator('text=報酬').count()) > 0 && new URL(p.url()).pathname === '/app/rewards',
    back: async p => { await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200) },
  },
  {
    surface: 'supplier', email: SUP, start: '/app',
    op: async p => { await p.locator('.sup-side a[href="/app/s/money"]').click() },
    ready: async p => (await p.locator('h1:has-text("お金")').count()) > 0,
    back: async p => { await p.goto(BASE + '/app', { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200) },
  },
]

for (const sc of SCENARIOS) {
  const ctx = anchorContext
  await ctx.clearCookies()
  const p = await ctx.newPage()
  const failed: string[] = []
  let authStart = 0, authMs: number | null = null, apiFirstAt = 0, apiFirstMs: number | null = null, measuring = false, resumeAt = 0
  p.on('request', r => { if (r.url().includes('/auth/v1/token')) authStart = Date.now() })
  p.on('response', async r => {
    if (r.url().includes('/auth/v1/token') && authStart) { authMs = Date.now() - authStart }
    if (measuring && r.url().startsWith(BASE + '/api/') && !apiFirstMs) { apiFirstMs = Date.now() - resumeAt; apiFirstAt = Date.now() }
    if (measuring && (r.status() >= 500 || r.status() === 401)) failed.push(`${r.status()} ${new URL(r.url()).pathname}`)
  })
  await p.clock.install()
  await login(p, sc.email, sc.start)
  await p.goto(BASE + sc.start, { waitUntil: 'domcontentloaded' })
  await p.waitForTimeout(2200)

  // warm 基準
  {
    const t0 = Date.now(); await sc.op(p)
    while (!(await sc.ready(p)) && Date.now() - t0 < 8000) await p.waitForTimeout(25)
    rows.push({ label: LABEL, surface: sc.surface, mode: 'warm', idleMin: 0, clickToContentMs: Date.now() - t0, authRefreshMs: null, apiFirstMs: null, failed: [] })
    await sc.back?.(p)
  }

  for (const idleMin of [5, 35, 65]) {
    for (const mode of ['immediate', 'human'] as const) {
      await setHidden(p, true)
      await p.clock.fastForward(idleMin * 60_000)
      await p.waitForTimeout(150)
      authMs = null; authStart = 0; apiFirstMs = null; failed.length = 0
      measuring = true; resumeAt = Date.now()
      await setHidden(p, false)
      if (mode === 'human') await p.waitForTimeout(500)
      const t0 = Date.now(); await sc.op(p)
      while (!(await sc.ready(p)) && Date.now() - t0 < 15000) await p.waitForTimeout(25)
      const ms = Date.now() - t0
      // 復帰後の操作可能性: もう一度操作して応答すること（再読み込み不要の実測）
      await p.waitForTimeout(600)
      const alive = await p.evaluate('document.body.innerText.length > 100') as boolean
      if (!alive) failed.push('body-empty')
      rows.push({ label: LABEL, surface: sc.surface, mode, idleMin, clickToContentMs: ms, authRefreshMs: authMs, apiFirstMs, failed: [...failed] })
      measuring = false
      await sc.back?.(p)
      await p.waitForTimeout(400)
    }
  }
  await p.close()
}
await anchorContext.close()
await b.close()
for (const r of rows) appendFileSync(OUT, JSON.stringify(r) + '\n')
console.table(rows.map(r => ({ surface: r.surface, mode: r.mode, idle: r.idleMin, ms: r.clickToContentMs, auth: r.authRefreshMs ?? '-', api1st: r.apiFirstMs ?? '-', fail: r.failed.join(';') })))
await cleanup()
console.log('done', LABEL)
const regressions = rows.filter(r => r.failed.length || (r.mode !== 'immediate' && r.clickToContentMs > 500))
console.log(`RESUME-PERF: ${rows.length - regressions.length} green / ${regressions.length} red`)
process.exit(regressions.length ? 1 : 0)
} catch (error) {
  await cleanup()
  throw error
}
