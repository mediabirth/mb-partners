import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

// --- env from .env.local (values never printed) ---
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY
const OWNER = process.env.TEST_EMAIL || 'katsuhiko-demo@mb-demo.test'
const ORIGIN = 'https://mb-partners.app'

// 1) mint owner session
const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: OWNER })
if (lerr) throw lerr
const { data: vfy, error: verr } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
if (verr) throw verr
const session = vfy.session
console.log('minted session for owner:', !!session, 'uid=', session?.user?.id?.slice(0, 8))

// 2) reconstruct the exact mb-auth-app SSR cookies via createServerClient
const jar = {}
const ssr = createServerClient(URL, ANON, {
  cookieOptions: { name: 'mb-auth-app' },
  cookies: {
    getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })),
    setAll: (arr) => arr.forEach(({ name, value }) => { jar[name] = value }),
  },
})
await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
const cookies = Object.entries(jar).map(([name, value]) => ({ name, value, domain: 'mb-partners.app', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))
console.log('reconstructed cookies:', cookies.map(c => c.name).join(', '))

// 3) drive chromium
const browser = await chromium.launch()
const ctx = await browser.newContext()
await ctx.addCookies(cookies)
const page = await ctx.newPage()
const consoleErrs = [], pageErrs = [], svcResponses = []
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()) })
page.on('pageerror', e => pageErrs.push(String(e)))
page.on('request', q => { if (q.url().includes('/api/services')) console.log('  →REQ', q.method(), q.resourceType(), 'from-sw=' + (q.serviceWorker?.() ? 'y' : 'n')) })
page.on('response', async r => { if (r.url().includes('/api/services')) { let body = ''; try { body = await r.text() } catch (e) { body = '<err:' + e.message + '>' } const h = r.headers(); svcResponses.push({ status: r.status(), len: body.length, fromCache: h['x-vercel-cache'], cc: h['cache-control'], head: body.slice(0, 40) }) } })

const frameNavs = []
page.on('framenavigated', f => { if (f === page.mainFrame()) frameNavs.push(f.url()) })
const TARGET = process.env.TARGET || '/app/refer'
const resp = await page.goto(ORIGIN + TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 })
console.log('initial nav status:', resp?.status(), '| url:', page.url())
// wait but tolerate mid-navigations
for (let i = 0; i < 10; i++) { try { await page.waitForTimeout(800) } catch {} }

let names = [], bodyText = '(unavailable)'
try {
  names = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('button').forEach(b => {
      const t = (b.textContent || '').trim()
      if (t && t.length < 60 && /MOOM|MatchHub|RESONATION|PRAGMATION|ENTERSOLOGY/.test(t)) out.push(t.slice(0, 40))
    })
    return out
  })
  bodyText = await page.evaluate(() => document.body.innerText.slice(0, 600))
} catch (e) { console.log('evaluate failed:', e.message) }

console.log('=== FINAL url ===', page.url())
console.log('=== main-frame navigations ===', JSON.stringify(frameNavs))
console.log('=== /api/services responses seen in-browser ===', JSON.stringify(svcResponses))
console.log('=== rendered service names ===', JSON.stringify(names))
console.log('=== console errors ===', JSON.stringify(consoleErrs.slice(0, 10)))
console.log('=== page errors ===', JSON.stringify(pageErrs.slice(0, 10)))
console.log('=== visible body text (top) ===\n' + bodyText)
await browser.close()
