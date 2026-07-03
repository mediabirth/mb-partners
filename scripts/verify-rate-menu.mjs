import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY
const OWNER = process.env.TEST_EMAIL || 'katsuhiko-demo@mb-demo.test'
const ORIGIN = 'https://mb-partners.app'

const admin = createClient(URL, SR, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: OWNER })
const { data: vfy } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
const session = vfy.session
const jar = {}
const ssr = createServerClient(URL, ANON, { cookieOptions: { name: 'mb-auth-app' },
  cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (arr) => arr.forEach(({ name, value }) => { jar[name] = value }) } })
await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
const cookies = Object.entries(jar).map(([name, value]) => ({ name, value, domain: 'mb-partners.app', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))

const browser = await chromium.launch()
const ctx = await browser.newContext(); await ctx.addCookies(cookies)
const page = await ctx.newPage()
await page.goto(ORIGIN + '/app/refer', { waitUntil: 'domcontentloaded', timeout: 45000 })
try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
await page.waitForTimeout(1500)

const R = {}
// expand PRAGMATION
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /PRAGMATION/.test(x.textContent || '')); if (b) b.click() })
await page.waitForTimeout(900)

// list task pills for DX化コンサル row: collect pill spans near the row
R.list_pills = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('button')].filter(x => /DX化コンサル/.test(x.textContent || ''))
  const row = rows[rows.length - 1]
  if (!row) return null
  return [...row.querySelectorAll('span')].map(s => (s.textContent || '').trim())
    .filter(t => ['つなぐ', 'アポイント', 'ヒヤリング', 'アシスト/フォロー'].includes(t))
})

// click DX化コンサル → register
await page.evaluate(() => { const rows = [...document.querySelectorAll('button')].filter(x => /DX化コンサル/.test(x.textContent || '')); const r = rows[rows.length - 1]; if (r) r.click() })
await page.waitForTimeout(1200)

// register form task-check labels (coopMode true → coverage task checks visible)
R.register_tasks = await page.evaluate(() => {
  const known = ['つなぐ', 'アポイント', 'ヒヤリング', 'アシスト/フォロー']
  const found = []
  document.querySelectorAll('body *').forEach(el => {
    if (el.children.length === 0) {
      const t = (el.textContent || '').trim()
      if (known.includes(t) && !found.includes(t)) found.push(t)
    }
  })
  return found
})

// open sheet, read task pills in order
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /このメニューを詳しく/.test(x.textContent || '')); if (b) b.click() })
await page.waitForTimeout(900)
R.sheet_pills = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]'); if (!d) return null
  const known = ['つなぐ', 'アポイント', 'ヒヤリング', 'アシスト/フォロー']
  return [...d.querySelectorAll('span')].map(s => (s.textContent || '').trim()).filter(t => known.includes(t))
})
R.sheet_full = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d ? (d.innerText || '').replace(/\n+/g, ' | ').slice(0, 260) : null })

console.log(JSON.stringify(R, null, 2))
await browser.close()
