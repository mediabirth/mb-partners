import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY
const HOST = 'console.mb-partners.app', ORIGIN = 'https://' + HOST

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'mediabirth.project@gmail.com' })
const { data: vfy } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
const jar = {}
const ssr = createServerClient(URL, ANON, { cookieOptions: { name: 'mb-auth-console' },
  cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (a) => a.forEach(({ name, value }) => { jar[name] = value }) } })
await ssr.auth.setSession({ access_token: vfy.session.access_token, refresh_token: vfy.session.refresh_token })
const cookies = Object.entries(jar).map(([name, value]) => ({ name, value, domain: HOST, path: '/', secure: true, sameSite: 'Lax' }))

const browser = await chromium.launch()
const ctx = await browser.newContext(); await ctx.addCookies(cookies)
const page = await ctx.newPage()
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 120)))

await page.goto(ORIGIN + '/console/deals', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(3500)
await page.getByText('ZZ_継続案件', { exact: false }).first().click()
await page.waitForTimeout(1500)
await page.getByRole('button', { name: '進行', exact: true }).click()
await page.waitForTimeout(1200)
const sees = await page.evaluate(() => ({
  badge: document.body.innerText.includes('継続報酬'),
  confirmBtn: document.body.innerText.includes('今月分を確定'),
  rate: document.body.innerText.includes('粗利 10% / 月') || document.body.innerText.includes('粗利 10%'),
}))
console.log('drawer continuous section visible:', JSON.stringify(sees))
// fill gross + confirm
await page.locator('input[placeholder*="今月の"]').last().fill('300000')
await page.waitForTimeout(500)
const calc = await page.evaluate(() => { const m = document.body.innerText.match(/¥30,000/); return !!m })
console.log('auto-calc shows ¥30,000:', calc)
await page.getByRole('button', { name: '今月分を確定' }).click()
await page.waitForTimeout(3500)
console.log('page errors:', JSON.stringify(errs.slice(0, 5)))
await browser.close()

const { data: cp } = await admin.from('continuous_payouts').select('period_month, gross_input, confirmed_amount, status').eq('deal_id', '89a789ca-9160-4659-bf1c-5c44dd2397e3')
console.log('=== continuous_payouts for deal ===')
for (const r of cp ?? []) console.log(`  ${r.period_month}: gross=${r.gross_input} confirmed=${r.confirmed_amount} status=${r.status}`)
const ok = (cp ?? []).some(r => r.confirmed_amount === 30000 && r.status === 'confirmed')
console.log(`VERDICT: confirmed ¥30,000 (¥300,000×10%) → ${ok ? 'PASS ✓' : 'FAIL ✗'}`)
