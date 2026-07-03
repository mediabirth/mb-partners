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
const { data: link, error: lerr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: OWNER })
if (lerr) throw lerr
const { data: vfy, error: verr } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
if (verr) throw verr
const session = vfy.session
console.log('minted:', !!session, 'uid=', session?.user?.id?.slice(0, 8))
const jar = {}
const ssr = createServerClient(URL, ANON, {
  cookieOptions: { name: 'mb-auth-app' },
  cookies: { getAll: () => Object.entries(jar).map(([name, value]) => ({ name, value })), setAll: (arr) => arr.forEach(({ name, value }) => { jar[name] = value }) },
})
await ssr.auth.setSession({ access_token: session.access_token, refresh_token: session.refresh_token })
const cookies = Object.entries(jar).map(([name, value]) => ({ name, value, domain: 'mb-partners.app', path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))

const browser = await chromium.launch()
const ctx = await browser.newContext()
await ctx.addCookies(cookies)
const page = await ctx.newPage()
const pageErrs = []
page.on('pageerror', e => pageErrs.push(String(e)))

// ---- 1) refer page behavior ----
await page.goto(ORIGIN + '/app/refer', { waitUntil: 'domcontentloaded', timeout: 45000 })
for (let i = 0; i < 8; i++) { try { await page.waitForTimeout(700) } catch {} }

const R = {}
try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
await page.waitForTimeout(1200)
// find a brand card button (contains a service name) and click to expand
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')]
  const b = btns.find(x => /MOOM|MatchHub|RESONATION|PRAGMATION|ENTERSOLOGY/.test(x.textContent || ''))
  if (b) b.click()
})
await page.waitForTimeout(900)

const listText = await page.evaluate(() => document.body.innerText)
R.list_has_menuN       = /メニュー\s*\d/.test(listText)            // expect false
R.list_has_tsunagu_hint= /つなぐだけのメニュー/.test(listText)      // expect false
R.list_has_task_badge  = /タスク\s*\d/.test(listText)              // expect false
// count filled buttons on refer (塗り: background is a solid blue) — collect distinct bg
R.filled_blue_buttons  = await page.evaluate(() => {
  let n = 0
  document.querySelectorAll('button').forEach(b => {
    const bg = getComputedStyle(b).backgroundColor
    if (/rgb\(71,\s*51,\s*230\)|rgb\(28,\s*100,\s*242\)/.test(bg) || bg === 'rgb(37, 99, 235)') n++
  })
  return n
})

// pick a menu row → register context header
const clickedMenu = await page.evaluate(() => {
  // menu rows are buttons inside expanded card with a reward pill and chevron-right; pick one whose text is not a brand name
  const btns = [...document.querySelectorAll('button')]
  const brand = /MOOM|MatchHub|RESONATION|PRAGMATION|ENTERSOLOGY|戻る|詳しく|閉じる/
  const row = btns.find(x => {
    const t = (x.textContent || '').trim()
    return t.length > 0 && t.length < 50 && !brand.test(t) && x.querySelector('svg')
  })
  if (row) { row.click(); return (row.textContent || '').trim().slice(0, 30) }
  return null
})
await page.waitForTimeout(1000)
const formText = await page.evaluate(() => document.body.innerText)
R.clicked_menu = clickedMenu
R.reg_has_back        = /メニュー選択に戻る/.test(formText)         // expect true
R.reg_has_detail_link = /このメニューを詳しく/.test(formText)       // expect true
R.reg_has_pay_note    = /翌月末払い/.test(formText)                 // expect true (money non-破壊)

// open detail sheet
const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /このメニューを詳しく/.test(x.textContent || ''))
  if (b) { b.click(); return true }
  return false
})
await page.waitForTimeout(900)
R.detail_link_clicked = opened
R.sheet_present = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
R.sheet_has_close = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')
  return d ? /閉じる/.test(d.textContent || '') : false
})
R.sheet_text = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]')
  return d ? (d.innerText || '').replace(/\n+/g, ' | ').slice(0, 300) : '(no sheet)'
})

// ---- 2) build stamp SHA via /app/settings ----
await page.goto(ORIGIN + '/app/settings', { waitUntil: 'domcontentloaded', timeout: 45000 })
for (let i = 0; i < 6; i++) { try { await page.waitForTimeout(600) } catch {} }
const settingsText = await page.evaluate(() => document.body.innerText)
const m = settingsText.match(/build\s+([0-9a-f]{7})/)
R.build_sha = m ? m[1] : '(not found)'

R.page_errors = pageErrs.slice(0, 8)
console.log(JSON.stringify(R, null, 2))
await browser.close()
