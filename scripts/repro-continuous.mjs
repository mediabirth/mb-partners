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

await page.goto(ORIGIN + '/console/services', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(3000)
await page.getByRole('button', { name: '編集' }).nth(0).click()   // MOOM = 1st
await page.waitForTimeout(2000)
await page.getByRole('button', { name: 'メニューを追加' }).click()
await page.waitForTimeout(800)
await page.getByPlaceholder('メニュー名').last().fill('ZZ_継続テストMENU')
// reward1 → 継続（毎月）
await page.getByRole('button', { name: '継続（毎月）' }).last().click()
await page.waitForTimeout(400)
await page.getByPlaceholder('50').last().fill('10')      // 毎月の率
await page.getByPlaceholder('12').last().fill('12')      // 期間
await page.waitForTimeout(300)
await page.getByRole('button', { name: '保存してパートナー画面へ反映' }).click()
await page.waitForTimeout(4000)
console.log('saved. page errors:', JSON.stringify(errs.slice(0, 5)))
await browser.close()

const { data: menu } = await admin.from('menus').select('id').eq('name', 'ZZ_継続テストMENU').maybeSingle()
if (!menu) { console.log('RESULT: menu NOT created'); process.exit(0) }
const { data: rewards } = await admin.from('menu_rewards').select('reward_type, reward_value, reward_base, default_months').eq('menu_id', menu.id)
console.log('=== DB menu_rewards for ZZ_継続テストMENU ===')
for (const r of rewards) console.log(`  ${r.reward_type}: value=${r.reward_value} base=${r.reward_base} default_months=${r.default_months}`)
const c = rewards.find(r => r.reward_type === 'continuous')
console.log(`VERDICT: continuous rate=${c?.reward_value} months=${c?.default_months} → ${c?.reward_value === 10 && c?.default_months === 12 ? 'PASS ✓' : 'FAIL ✗'}`)
console.log('MENU_ID=' + menu.id)
