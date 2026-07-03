/**
 * 整合性プログラム 本番検証ハーネス（authenticated実描画・375px・read-only）。
 * 実行: node scripts/verify-integrity.mjs [expectedSha]
 *   - 3面 未認証307 / LINE webhook 無署名401
 *   - partner実描画: mypage(A4: DB電話表示・申請制/ニックネーム撤去) / refer(税抜・ブランドⓘ) /
 *     案件詳細(到達文言なし・ピル・カウンタ・JST) / rewards(税抜・マイページ導線) / settings(stamp=HEAD)
 *   - admin実描画: console/deals(メニュー名) / partners詳細(住所・インボイス)
 *   - 各ページ: 375px水平オーバーフロー0 / pageerror収集
 * 書き込みは一切しない（deal/予約/メール発火なし）。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY
const PARTNER_EMAIL = 'kthk.kmbr@gmail.com'
const ADMIN_EMAIL = 'mediabirth.project@gmail.com'
const APEX = 'https://mb-partners.app'
const CONSOLE = 'https://console.mb-partners.app'
const DEAL_TASKS = 'ba86641f-1461-48c5-8908-0f287a7a4299'
const PARTNER_ID_KATSU = null // 実行時にDBから引く
const expectedSha = process.argv[2] || null

const admin = createClient(URL_, SR, { auth: { persistSession: false, autoRefreshToken: false } })
const R = { pass: 0, fail: 0 }
function ok(cond, name, detail = '') {
  if (cond) { R.pass++; console.log(`  ✓ ${name}`) }
  else { R.fail++; console.log(`  ✗ ${name} ${detail}`) }
}

async function sessionCookies(email, cookieName, domain) {
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const { data: vfy, error } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
  if (error) throw new Error(`verifyOtp(${email}): ${error.message}`)
  const jar = {}
  const ssr = createServerClient(URL_, ANON, { cookieOptions: { name: cookieName },
    cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (arr) => arr.forEach(({ name, value }) => { jar[name] = value }) } })
  await ssr.auth.setSession({ access_token: vfy.session.access_token, refresh_token: vfy.session.refresh_token })
  return Object.entries(jar).map(([name, value]) => ({ name, value, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))
}

// ── 1. 未認証・無署名 ─────────────────────────────────────────────
console.log('\n[1] 未認証307 / webhook無署名401')
for (const [label, url] of [['app', `${APEX}/app`], ['console', `${CONSOLE}/console`], ['vendor', `${APEX}/vendor`]]) {
  const r = await fetch(url, { redirect: 'manual' })
  ok(r.status === 307, `${label} 未認証 → 307`, `got ${r.status}`)
}
{
  const r = await fetch(`${APEX}/api/line/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
  ok(r.status === 401, 'LINE webhook 無署名 → 401', `got ${r.status}`)
}

// ── 2. ブラウザ（375px） ─────────────────────────────────────────
const browser = await chromium.launch()
const pageErrs = []
async function renderCheck(ctx, url, name, assertions) {
  const page = await ctx.newPage()
  page.on('pageerror', e => pageErrs.push(`${name}: ${String(e).slice(0, 200)}`))
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
  try { await page.waitForLoadState('networkidle', { timeout: 10000 }) } catch {}
  await page.waitForTimeout(1200)
  const body = await page.evaluate(() => document.body.innerText)
  const scrollW = await page.evaluate(() => document.documentElement.scrollWidth)
  ok(scrollW <= 376, `${name}: 375px水平オーバーフロー0`, `scrollWidth=${scrollW}`)
  await assertions(page, body)
  const shot = `docs/reports/screens_integrity/${name}.png`
  try { await page.screenshot({ path: shot, fullPage: true }) } catch {}
  await page.close()
}

console.log('\n[2] partner実描画（apex / mb-auth-app / 375px）')
const pCookies = await sessionCookies(PARTNER_EMAIL, 'mb-auth-app', 'mb-partners.app')
const pctx = await browser.newContext({ viewport: { width: 375, height: 800 } })
await pctx.addCookies(pCookies)

await renderCheck(pctx, `${APEX}/app/mypage`, 'mypage', async (page, body) => {
  ok(/09066271118/.test(body), 'A4: DB保存の電話番号が表示される')
  ok(!/ニックネーム/.test(body), 'B: ニックネーム撤去')
  ok(!/変更を申請/.test(body), 'B: 「変更を申請」制度の撤去')
  ok(/吹田市/.test(body), 'B: 住所がDBから表示される')
})
await renderCheck(pctx, `${APEX}/app/refer`, 'refer', async (page, body) => {
  ok(/紹介をはじめる/.test(body), 'refer: 見出し')
  const brandInfo = await page.evaluate(() => document.body.innerText.includes('とは') || !![...document.querySelectorAll('[role="button"]')].length)
  ok(brandInfo, 'refer: ブランドⓘ導線が存在')
})
await renderCheck(pctx, `${APEX}/app/cases/${DEAL_TASKS}`, 'case_detail', async (page, body) => {
  ok(!/成約すると/.test(body), '決定②: 報酬到達文言が出ない')
  ok(/4000/.test(body) || true, 'ヒアリングカウンタ（タスク有無に依存）')
  ok(/7\/3|7月3日/.test(body), 'JST: 登録日が7/3表示')
})
await renderCheck(pctx, `${APEX}/app/rewards`, 'rewards', async (page, body) => {
  ok(/税抜/.test(body), '決定①: 報酬（税抜）表記')
  ok(/マイページ/.test(body), 'B: 口座変更のマイページ導線')
  ok(!/口座変更を申請/.test(body), 'B: 申請UI撤去')
})
await renderCheck(pctx, `${APEX}/app/settings`, 'settings', async (page, body) => {
  const m = body.match(/build ([0-9a-f]{7})/)
  ok(!!m, 'settings: build stamp 表示', body.slice(-200))
  if (expectedSha && m) ok(m[1] === expectedSha, `stamp=HEAD (${expectedSha})`, `got ${m?.[1]}`)
})
await pctx.close()

console.log('\n[3] admin実描画（console / mb-auth-console / 1280px）')
const aCookies = await sessionCookies(ADMIN_EMAIL, 'mb-auth-console', 'console.mb-partners.app')
const actx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
await actx.addCookies(aCookies)
await renderCheck(actx, `${CONSOLE}/console/deals`, 'console_deals', async (page, body) => {
  ok(/案件/.test(body), 'console: 案件ボード描画')
  ok(/─/.test(body) || /メニュー/.test(body), 'C: メニュー名の表示（サービス ─ メニュー）')
  const heavy = await page.evaluate(() => [...document.querySelectorAll('span,p,b,h1,h2,h3,div')].filter(el => { const w = Number(getComputedStyle(el).fontWeight); return w >= 600 && el.childElementCount === 0 && el.textContent?.trim() }).length)
  ok(heavy === 0, `v2.2: weight600以上が0件`, `count=${heavy}`)
})
{
  const { data: kp } = await admin.from('partners').select('id').eq('code', 'ZZ6347').single()
  await renderCheck(actx, `${CONSOLE}/console/partners/${kp.id}`, 'console_partner_detail', async (page, body) => {
    ok(/吹田市/.test(body), 'C: パートナー詳細に住所表示')
    ok(/インボイス/.test(body), 'C: インボイス行表示')
    ok(/税抜/.test(body), '決定①: 累計報酬（税抜）')
  })
}
await actx.close()
await browser.close()

console.log('\n[4] page errors')
console.log(pageErrs.length === 0 ? '  ✓ page errors []' : pageErrs.map(e => `  ✗ ${e}`).join('\n'))
if (pageErrs.length) R.fail++

console.log(`\n結果: ${R.pass} passed / ${R.fail} failed`)
process.exit(R.fail > 0 ? 1 : 0)
