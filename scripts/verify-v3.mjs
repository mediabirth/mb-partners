import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY
const OWNER = process.env.TEST_EMAIL || 'katsuhiko-demo@mb-demo.test'
const ORIGIN = 'https://mb-partners.app'
const BRANDS = ['MOOM', 'MatchHub', 'RESONATION', 'PRAGMATION', 'EMANATION', 'ENTERSOLOGY']

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
const ctx = await browser.newContext({ viewport: { width: 375, height: 780 } })
await ctx.addCookies(cookies)
const page = await ctx.newPage()
const pageErrs = []
page.on('pageerror', e => pageErrs.push(String(e)))
await page.goto(ORIGIN + '/app/refer', { waitUntil: 'domcontentloaded', timeout: 45000 })
try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
await page.waitForTimeout(1500)

const R = {}
const visibleBrands = () => page.evaluate((BR) => {
  const cards = [...document.querySelectorAll('.ob-card')]
  const out = []
  cards.forEach(c => { const t = c.textContent || ''; BR.forEach(b => { if (t.includes(b) && !out.includes(b)) out.push(b) }) })
  return out
}, BRANDS)
const setSearch = async (v) => { await page.fill('input[placeholder="ブランド・メニューを探す"]', v); await page.waitForTimeout(500) }
const clickChip = async (label) => { await page.evaluate((l) => { const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').trim() === l && x.offsetWidth < 200); if (b) b.click() }, label); await page.waitForTimeout(400) }

// header presence
R.has_search = await page.$('input[placeholder="ブランド・メニューを探す"]') != null
R.chips = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => ['すべて','不動産','人材','制作','マーケ','業務改善','エンタメ'].includes(t)))
R.brands_all = await visibleBrands()

// 1) search 部屋 → MOOM only
await setSearch('部屋')
R.search_heya = await visibleBrands()
// 2) clear, chip 不動産 → MOOM only
await setSearch('')
await clickChip('不動産')
R.chip_fudosan = await visibleBrands()
// 3) AND: chip 制作 + search 部屋 → 0 ; chip 不動産 + search 部屋 → MOOM
await clickChip('制作'); await setSearch('部屋')
R.and_seisaku_heya = await visibleBrands()
await clickChip('不動産')
R.and_fudosan_heya = await visibleBrands()
// 4) 0件 empty state
await clickChip('すべて'); await setSearch('zzzznothing')
R.empty_msg = await page.evaluate(() => /該当するメニューがありません/.test(document.body.innerText))
R.empty_consult_present = await page.evaluate(() => /迷ったらまず相談/.test(document.body.innerText))
// 5) recover
await setSearch('')
R.recovered = await visibleBrands()

// ---- register header purity + sheet ----
// expand PRAGMATION, pick DX化コンサル (rate, has trigger + service desc, no image, no menu desc)
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /PRAGMATION/.test(x.textContent || '')); if (b) b.click() })
await page.waitForTimeout(800)
await page.evaluate(() => { const rows = [...document.querySelectorAll('button')].filter(x => /DX化コンサル/.test(x.textContent || '')); const r = rows[rows.length - 1]; if (r) r.click() })
await page.waitForTimeout(1200)
const headerText = await page.evaluate(() => {
  // the context header is the block right after the back button, before the form
  return document.body.innerText.slice(0, 400)
})
R.header_has_short_desc  = /動きをつくる|良い構想/.test(headerText)   // short_description text — expect false (removed)
R.header_has_pay_note    = /翌月末払い/.test(headerText)             // expect false (removed)
R.header_has_detail_link = /このメニューを詳しく/.test(headerText)   // expect false (removed)
R.header_has_info_btn    = await page.evaluate(() => !!document.querySelector('button[aria-label="メニューの詳細"]'))

// open sheet via ⓘ
await page.evaluate(() => { const b = document.querySelector('button[aria-label="メニューの詳細"]'); if (b) b.click() })
await page.waitForTimeout(900)
R.sheet_present = await page.evaluate(() => !!document.querySelector('[role="dialog"]'))
R.sheet_has_subtitle_dash = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d ? /─/.test(d.textContent || '') : null }) // expect false
R.sheet_has_trigger = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d ? /に確定/.test(d.textContent || '') : null }) // expect true
R.sheet_hero_fallback = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); if (!d) return null; return !d.querySelector('img') && !!d.querySelector('svg') }) // no image_url → fallback (no img)
R.sheet_order = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]'); if (!d) return null
  const t = d.innerText
  const idx = s => t.indexOf(s)
  return { toha: idx('とは'), koko: idx('このメニューでは'), tasks: idx('あなたの協力タスク'), close: idx('閉じる'), trigger: idx('に確定') }
})
R.sheet_full = await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); return d ? (d.innerText || '').replace(/\n+/g, ' | ').slice(0, 300) : null })

// horizontal overflow at 375
R.doc_scroll_w = await page.evaluate(() => document.documentElement.scrollWidth)
R.win_w = await page.evaluate(() => window.innerWidth)

// build stamp
await page.goto(ORIGIN + '/app/settings', { waitUntil: 'domcontentloaded', timeout: 45000 })
for (let i = 0; i < 6; i++) { try { await page.waitForTimeout(600) } catch {} }
const m = (await page.evaluate(() => document.body.innerText)).match(/build\s+([0-9a-f]{7})/)
R.build_sha = m ? m[1] : '(not found)'
R.page_errors = pageErrs.slice(0, 8)

console.log(JSON.stringify(R, null, 2))
await browser.close()
