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
const ctx = await browser.newContext()
await ctx.addCookies(cookies)
const page = await ctx.newPage()
const errs = []
page.on('pageerror', e => errs.push(String(e).slice(0, 100)))

await page.goto(ORIGIN + '/console/services', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(3000)

// MatchHub = 2nd service → 2nd 編集 button
await page.getByRole('button', { name: '編集' }).nth(1).click()
await page.waitForTimeout(2000)
console.log('drawer opened on:', page.url())

// add a menu
await page.getByRole('button', { name: 'メニューを追加' }).click()
await page.waitForTimeout(800)
await page.getByPlaceholder('メニュー名').last().fill('ZZ_parseテストMENU')
// reward1 (fixed default): type a COMMA'd amount — the exact bug input
await page.getByPlaceholder('30000').last().fill('30,000')
// add reward2, switch to 粗利（%）, type 50
await page.getByRole('button', { name: '報酬を追加' }).last().click()
await page.waitForTimeout(800)
await page.getByRole('button', { name: '粗利（%）' }).last().click()
await page.waitForTimeout(400)
await page.getByPlaceholder('50').last().fill('50')
await page.waitForTimeout(300)
// save
await page.getByRole('button', { name: '保存してパートナー画面へ反映' }).click()
await page.waitForTimeout(4000)
console.log('saved. page errors:', JSON.stringify(errs.slice(0, 5)))
await browser.close()

// read back DB
const { data: menu } = await admin.from('menus').select('id').eq('name', 'ZZ_parseテストMENU').maybeSingle()
if (!menu) { console.log('RESULT: menu NOT created'); process.exit(0) }
const { data: rewards } = await admin.from('menu_rewards').select('reward_type, reward_value, reward_base').eq('menu_id', menu.id).order('sort')
console.log('=== DB menu_rewards for ZZ_parseテストMENU ===')
for (const r of rewards) console.log(`  ${r.reward_type}: reward_value=${r.reward_value} base=${r.reward_base ?? '-'}`)
const fixed = rewards.find(r => r.reward_type === 'fixed')
const rate = rewards.find(r => r.reward_type === 'rate')
console.log(`VERDICT: fixed=${fixed?.reward_value} (expect 30000) | rate=${rate?.reward_value} (expect 50) → ${fixed?.reward_value === 30000 && rate?.reward_value === 50 ? 'PASS ✓' : 'FAIL ✗'}`)
