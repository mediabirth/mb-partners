/**
 * LP-1 公開面検証。
 * - 4面を375×667・Service Worker blockで実描画し、before/afterを同じ条件で撮影
 * - afterではLP-1の主要文言・横溢れ・pageerrorを検査
 * - VERIFY_SUBMIT=1では内部シンクthrowaway応募を実走し、CC_MAIL_SUPPRESS下の送信0と残置0を確認
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { launchChromium } from './playwright-launch.mjs'

const BASE = process.env.BASE_APP || 'http://localhost:4599'
const PHASE = process.env.SHOT_PHASE || 'after'
const VERIFY_SUBMIT = process.env.VERIFY_SUBMIT === '1'
const SHOT_DIR = path.resolve('docs/reports/lp1_screens')
const PREFIX = 'cc-lp1-suppress@mb-system.internal'
let pass = 0
let fail = 0
const errors: string[] = []
const ok = (condition: boolean, name: string, detail = '') => {
  if (condition) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` (${detail})` : ''}`) }
}

fs.mkdirSync(SHOT_DIR, { recursive: true })
const browser = await launchChromium()
const context = await browser.newContext({
  viewport: { width: 375, height: 667 },
  serviceWorkers: 'block',
})
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))

const surfaces = [
  { key: 'apex', path: '/', copy: 'パートナー応募はこちら' },
  { key: 'partners', path: '/partners', copy: '例：¥30,000を成約時に' },
  { key: 'join', path: '/join', copy: '顧問先を一件おつなぎ' },
  { key: 'rewards', path: '/partners/rewards', copy: '成約月の翌月末' },
]

for (const surface of surfaces) {
  const response = await page.goto(`${BASE}${surface.path}?lp1=${PHASE}-${Date.now()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 45_000,
  })
  await page.waitForTimeout(900)
  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    text: document.body.innerText,
  }))
  ok(response?.status() === 200, `${surface.path}: 200`, `got ${response?.status()}`)
  ok(metrics.scrollWidth <= metrics.clientWidth, `${surface.path}: 375px水平オーバーフロー0`, `${metrics.scrollWidth}/${metrics.clientWidth}`)
  ok(metrics.text.trim().length > 80, `${surface.path}: 実描画`)
  if (PHASE !== 'before') ok(metrics.text.includes(surface.copy), `${surface.path}: LP-1文言`, surface.copy)
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let y = 0; y < height; y += 480) {
    await page.evaluate(nextY => window.scrollTo(0, nextY), y)
    await page.waitForTimeout(45)
  }
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(1_900)
  await page.screenshot({ path: path.join(SHOT_DIR, `${PHASE}-${surface.key}-375.png`), fullPage: true })
}

if (VERIFY_SUBMIT) {
  const env = Object.fromEntries(
    fs.readFileSync('.env.local', 'utf8')
      .split('\n')
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const at = line.indexOf('=')
        return [line.slice(0, at), line.slice(at + 1).replace(/^['"]|['"]$/g, '')]
      }),
  )
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  await admin.from('partner_applications').delete().eq('email', PREFIX)
  const since = new Date(Date.now() - 60_000).toISOString()
  const response = await context.request.post(`${BASE}/api/partner-apply`, {
    data: {
      name: 'CC LP1抑止確認',
      org: 'CC throwaway',
      expertise: '検証',
      email: PREFIX,
      phone: '',
      message: 'CC_MAIL_SUPPRESS=1',
      consent: true,
      kind: 'partner',
      website: '',
    },
  })
  ok(response.status() === 200, '抑止下の応募API成功', `got ${response.status()}`)
  const { count: applicationCount } = await admin
    .from('partner_applications').select('id', { count: 'exact', head: true }).eq('email', PREFIX)
  ok(applicationCount === 1, 'throwaway応募1件を確認')
  const { count: suppressedCount } = await admin
    .from('mail_log').select('id', { count: 'exact', head: true })
    .eq('to_email', PREFIX).eq('template_key', 'application-received').eq('status', 'skipped').gte('created_at', since)
  ok(suppressedCount === 1, '自動返信がCC_MAIL_SUPPRESS入口でno-op', `skipped=${suppressedCount}`)
  const { count: sentCount } = await admin
    .from('mail_log').select('id', { count: 'exact', head: true })
    .eq('to_email', PREFIX).eq('status', 'sent').gte('created_at', since)
  ok(sentCount === 0, 'CC_MAIL_SUPPRESS下の実送信0件', `sent=${sentCount}`)
  await admin.from('partner_applications').delete().eq('email', PREFIX)
  const { count: left } = await admin
    .from('partner_applications').select('id', { count: 'exact', head: true }).eq('email', PREFIX)
  ok(left === 0, 'LP-1応募fixture残置0', `application=${left}`)
}

await context.close()
await browser.close()
ok(errors.length === 0, 'page errors []', errors.join(' | '))
console.log(`\nLP1-PUBLIC: ${pass} passed / ${fail} failed`)
process.exit(fail ? 1 : 0)
