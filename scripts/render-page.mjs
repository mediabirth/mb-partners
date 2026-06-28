import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY

const EMAIL = process.env.TEST_EMAIL || 'katsuhiko-demo@mb-demo.test'
const SURFACE = process.env.SURFACE || 'app'           // app | console | vendor
const TARGET = process.env.TARGET || '/app/refer'
const NEEDLES = (process.env.NEEDLES || '').split('|').filter(Boolean)
const CLICK = process.env.CLICK || ''                  // optional: text of a button to click then re-scan
const COOKIE = SURFACE === 'console' ? 'mb-auth-console' : SURFACE === 'vendor' ? 'mb-auth-vendor' : 'mb-auth-app'
const HOST = SURFACE === 'console' ? 'console.mb-partners.app' : 'mb-partners.app'
const ORIGIN = 'https://' + HOST

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
if (lerr) throw lerr
const { data: vfy } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
const session = vfy.session

const jar = {}
const ssr = createServerClient(URL, ANON, {
  cookieOptions: { name: COOKIE },
  cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (a) => a.forEach(({ name, value }) => { jar[name] = value }) },
})
await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
const cookies = Object.entries(jar).map(([name, value]) => ({ name, value, domain: HOST, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))

const browser = await chromium.launch()
const ctx = await browser.newContext()
await ctx.addCookies(cookies)
const page = await ctx.newPage()
const cErr = [], pErr = []
page.on('console', m => { if (m.type() === 'error') cErr.push(m.text().slice(0, 120)) })
page.on('pageerror', e => pErr.push(String(e).slice(0, 120)))

const resp = await page.goto(ORIGIN + TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 })
for (let i = 0; i < 8; i++) { try { await page.waitForTimeout(800) } catch {} }

async function scan() {
  const body = await page.evaluate(() => document.body.innerText)
  return body
}
let body = await scan()
if (CLICK) {
  try {
    await page.getByText(CLICK, { exact: false }).first().click({ timeout: 8000 })
    for (let i = 0; i < 5; i++) { try { await page.waitForTimeout(700) } catch {} }
    body = await scan()
  } catch (e) { console.log('CLICK failed:', e.message.slice(0, 80)) }
}

console.log('SURFACE=' + SURFACE, 'EMAIL=' + EMAIL, 'TARGET=' + TARGET, 'CLICK=' + (CLICK || '-'))
console.log('FINAL url:', page.url(), '| nav:', resp?.status())
for (const n of NEEDLES) console.log(`  needle ${body.includes(n) ? 'FOUND ✓' : 'MISSING ✗'}: ${n}`)
console.log('console errors:', JSON.stringify(cErr.slice(0, 6)))
console.log('page errors:', JSON.stringify(pErr.slice(0, 6)))
console.log('--- body (first 700) ---\n' + body.slice(0, 700))
await browser.close()
