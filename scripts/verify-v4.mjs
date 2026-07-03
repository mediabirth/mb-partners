import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')] }))
const URL = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY, SR = env.SUPABASE_SERVICE_ROLE_KEY
const OWNER = 'kthk.kmbr@gmail.com'
const ORIGIN = 'https://mb-partners.app'
const DEAL_TASKS = 'ba86641f-1461-48c5-8908-0f287a7a4299'   // 神原勝彦 cooperation/4tasks（⑥）
const DEAL_ZERO  = '4edaf9a5-812e-4e2b-aa32-a784716223fc'   // 田中太郎 referral/0tasks（⑦）
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
const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } })
await ctx.addCookies(cookies)
const page = await ctx.newPage()
const pageErrs = []
page.on('pageerror', e => pageErrs.push(String(e)))
const R = {}
const visibleExpanded = () => page.evaluate((BR) => {
  const cards = [...document.querySelectorAll('.ob-card')]
  return cards.filter(c => c.textContent && BR.some(b => c.textContent.includes(b)))
    .map(c => { const b = BR.find(x => c.textContent.includes(x)); const expanded = !!c.querySelector('.exp-in'); return { b, expanded } })
}, BRANDS)

// ===== refer list ①②③④ =====
await page.goto(ORIGIN + '/app/refer', { waitUntil: 'domcontentloaded', timeout: 45000 })
try { await page.waitForLoadState('networkidle', { timeout: 8000 }) } catch {}
try { await page.waitForSelector('input[placeholder="ブランド・メニューを探す"]', { timeout: 15000 }) } catch {}
try { await page.waitForSelector('.ob-card', { timeout: 15000 }) } catch {}
await page.waitForTimeout(1500)

// ② heading
const bodyTop = await page.evaluate(() => document.body.innerText.slice(0, 200))
R.head_has_start = /紹介をはじめる/.test(bodyTop)
R.head_has_old_h1 = /どなたの顔が浮かびますか/.test(bodyTop)  // expect false
// ① closed brand card rows have no reward-range pill text
R.closed_card_reward_text = await page.evaluate((BR) => {
  const cards = [...document.querySelectorAll('.ob-card')]
  const firstBtn = cards[0]?.querySelector('button')
  const t = firstBtn ? firstBtn.textContent || '' : ''
  return /¥|粗利|継続|〜/.test(t)  // expect false
}, BRANDS)
// ③ consult card solid + copy
R.consult_card = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => /まず相談/.test(x.textContent || '') && /決まっていない/.test(x.textContent || ''))
  if (!b) return null
  const cs = getComputedStyle(b)
  return { found: true, borderStyle: cs.borderStyle, bg: cs.backgroundColor, text: (b.textContent || '').replace(/\s+/g, '').slice(0, 60) }
})
// ④c chip fade at 375
R.chip_fade = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('div')].filter(d => d.textContent && /すべて/.test(d.textContent))
  // fade is an aria-hidden gradient div
  return !![...document.querySelectorAll('div[aria-hidden]')].find(d => /linear-gradient/.test(getComputedStyle(d).backgroundImage))
})
// ④b exclusive accordion (no search): click MOOM then MatchHub
await page.evaluate(() => { const c = [...document.querySelectorAll('.ob-card')].find(x => /MOOM/.test(x.textContent || '')); c?.querySelector('button')?.click() })
await page.waitForTimeout(500)
const afterMoom = await visibleExpanded()
await page.evaluate(() => { const c = [...document.querySelectorAll('.ob-card')].find(x => /MatchHub/.test(x.textContent || '')); c?.querySelector('button')?.click() })
await page.waitForTimeout(500)
R.exclusive = { afterMoom: afterMoom.filter(x => x.expanded).map(x => x.b), afterMatchHub: (await visibleExpanded()).filter(x => x.expanded).map(x => x.b) }
// ④a search hits menu name → auto-expand + hit row
await page.fill('input[placeholder="ブランド・メニューを探す"]', '部屋'); await page.waitForTimeout(700)
R.search_autoexpand = (await visibleExpanded()).filter(x => x.expanded).map(x => x.b)
R.search_hit_row = await page.evaluate(() => /お部屋探し/.test(document.body.innerText))
// clear → collapse
await page.fill('input[placeholder="ブランド・メニューを探す"]', ''); await page.waitForTimeout(600)
R.cleared_collapsed = (await visibleExpanded()).filter(x => x.expanded).map(x => x.b)

// ⑤ consult page
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /まず相談/.test(x.textContent || '') && /決まっていない/.test(x.textContent || '')); b?.click() })
await page.waitForTimeout(700)
R.consult = await page.evaluate(() => {
  const t = document.body.innerText
  const cta = [...document.querySelectorAll('button')].find(b => /相談する/.test(b.textContent || '') && !/決まっていない/.test(b.textContent || ''))
  return {
    has_header: /まず相談/.test(t), has_new_copy: /メニューが決まっていなくて大丈夫です/.test(t),
    has_old_title: /迷ったら相談/.test(t), has_old_cta: /相談として起票する/.test(t),
    has_name_required: /お名前（必須）/.test(t), has_new_note_label: /相談したいこと（何を迷っているか）/.test(t),
    cta_label: cta ? (cta.textContent || '').trim() : null, cta_disabled_empty: cta ? cta.disabled : null,
  }
})
await page.fill('input[placeholder="山田 太郎"]', 'テスト太郎'); await page.waitForTimeout(400)
R.consult.cta_enabled_after_name = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /相談する/.test(x.textContent || '') && !/決まっていない/.test(x.textContent || '')); return b ? !b.disabled : null })

// ===== ⑥ case with tasks =====
await page.goto(ORIGIN + '/app/cases/' + DEAL_TASKS, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(1200)
R.case6 = await page.evaluate(() => {
  const t = document.body.innerText
  return {
    url: location.pathname.includes('/cases/'),
    reward_reach: /成約すると/.test(t), reward_value: /粗利の10%/.test(t),
    has_task_checklist: /協力タスク/.test(t),
    has_status_card: /いまの状況/.test(t),  // expect false for tasks-present
  }
})
// keyframes present (checkIn defined)
R.checkin_keyframe = await page.evaluate(() => {
  for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r.name === 'checkIn') return true } } catch {} }
  return false
})
R.checkin_applied = await page.evaluate(() => !!document.querySelector('.check-in'))

// ===== ⑦ case zero tasks =====
await page.goto(ORIGIN + '/app/cases/' + DEAL_ZERO, { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(1200)
R.case7 = await page.evaluate(() => {
  const t = document.body.innerText
  return {
    reward_reach: /成約すると/.test(t), reward_value: /¥30,000/.test(t),
    has_status_card: /いまの状況/.test(t),
    has_no_task_line: /あなたのタスクはありません/.test(t),
    has_old_gray: /MBが対応中です。お客さまへご連絡し/.test(t),  // expect false
    narrative_received: /最初のご連絡を準備しています/.test(t),
  }
})

// ===== ⑧ inbox =====
await page.goto(ORIGIN + '/app/inbox', { waitUntil: 'domcontentloaded', timeout: 45000 })
await page.waitForTimeout(1200)
R.inbox_tabs = await page.evaluate(() => [...document.querySelectorAll('button')].map(b => (b.textContent || '').trim()).filter(t => ['すべて', 'あなた宛', 'お知らせ', 'お役立ち'].includes(t)))

// overflow + stamp
await page.goto(ORIGIN + '/app/refer', { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(1000)
R.doc_scroll_w = await page.evaluate(() => document.documentElement.scrollWidth)
await page.goto(ORIGIN + '/app/settings', { waitUntil: 'domcontentloaded', timeout: 45000 }); await page.waitForTimeout(2500)
const m = (await page.evaluate(() => document.body.innerText)).match(/build\s+([0-9a-f]{7})/)
R.build_sha = m ? m[1] : '(not found)'
R.page_errors = pageErrs.slice(0, 8)

console.log(JSON.stringify(R, null, 2))
await browser.close()
