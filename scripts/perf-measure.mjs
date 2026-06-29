import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY

const EMAIL = process.env.TEST_EMAIL
const SURFACE = process.env.SURFACE || 'app'
const TARGET = process.env.TARGET || '/app'
const COOKIE = SURFACE === 'console' ? 'mb-auth-console' : SURFACE === 'vendor' ? 'mb-auth-vendor' : 'mb-auth-app'
const HOST = SURFACE === 'console' ? 'console.mb-partners.app' : 'mb-partners.app'
const ORIGIN = 'https://' + HOST

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL })
const { data: vfy } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
const jar = {}
const ssr = createServerClient(URL, ANON, { cookieOptions: { name: COOKIE }, cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (a) => a.forEach(({ name, value }) => { jar[name] = value }) } })
await ssr.auth.setSession({ access_token: vfy.session.access_token, refresh_token: vfy.session.refresh_token })
const cookies = Object.entries(jar).map(([name, value]) => ({ name, value, domain: HOST, path: '/', secure: true, sameSite: 'Lax' }))

const browser = await chromium.launch()
const ctx = await browser.newContext()
await ctx.addCookies(cookies)
const page = await ctx.newPage()

let jsBytes = 0, jsCount = 0, imgBytes = 0
const api = []
page.on('response', async r => {
  const u = r.url(); const ct = r.headers()['content-type'] || ''
  try {
    if (u.endsWith('.js') || ct.includes('javascript')) { const b = (await r.body().catch(() => Buffer.alloc(0))).length; jsBytes += b; jsCount++ }
    else if (ct.startsWith('image/')) { imgBytes += (await r.body().catch(() => Buffer.alloc(0))).length }
  } catch {}
})
page.on('requestfinished', async req => {
  const u = req.url()
  if (u.includes('/api/')) { const t = req.timing(); if (t) api.push({ url: u.replace(ORIGIN, '').split('?')[0], ms: Math.round(t.responseEnd - t.requestStart) }) }
})

const t0 = Date.now()
await page.goto(ORIGIN + TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 })
const tDom = Date.now() - t0
// settle
for (let i = 0; i < 6; i++) { try { await page.waitForTimeout(500) } catch {} }
const tSettle = Date.now() - t0

const nav = await page.evaluate(() => {
  const n = performance.getEntriesByType('navigation')[0] || {}
  return { ttfb: Math.round(n.responseStart || 0), domContentLoaded: Math.round(n.domContentLoadedEventEnd || 0), load: Math.round(n.loadEventEnd || 0), transfer: n.transferSize || 0 }
})
const slowApi = api.sort((a, b) => b.ms - a.ms).slice(0, 4)

console.log(`${SURFACE}${TARGET}`)
console.log(`  JS: ${Math.round(jsBytes / 1024)} KB (${jsCount} files) | img: ${Math.round(imgBytes / 1024)} KB`)
console.log(`  TTFB(server): ${nav.ttfb}ms | DOMContentLoaded(nav): ${nav.domContentLoaded}ms | goto→dom: ${tDom}ms | settle: ${tSettle}ms`)
console.log(`  API calls: ${api.length} | slowest: ${slowApi.map(a => `${a.url}=${a.ms}ms`).join(' , ') || '(none)'}`)
await browser.close()
