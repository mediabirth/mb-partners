/**
 * 磨きプログラム④: 主要動線のLCP/FCP/TTFB実測（authenticated・375px・本番・read-only）。
 * 実行: node scripts/perf-lcp.mjs [runs=3]
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { chromium } from 'playwright'

const env = Object.fromEntries(readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
  .filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const RUNS = Number(process.argv[2] || 3)

async function cookies(email, name, domain) {
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const { data: vfy } = await admin.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token })
  const jar = {}
  const ssr = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookieOptions: { name },
    cookies: { getAll: () => Object.entries(jar).map(([n, v]) => ({ name: n, value: v })), setAll: (a) => a.forEach(({ name: n, value: v }) => { jar[n] = v }) } })
  await ssr.auth.setSession({ access_token: vfy.session.access_token, refresh_token: vfy.session.refresh_token })
  return Object.entries(jar).map(([n, v]) => ({ name: n, value: v, domain, path: '/', httpOnly: false, secure: true, sameSite: 'Lax' }))
}

const PAGES = [
  ['app_home', 'https://mb-partners.app/app', 'partner'],
  ['app_cases', 'https://mb-partners.app/app/cases', 'partner'],
  ['app_refer', 'https://mb-partners.app/app/refer', 'partner'],
  ['app_case_detail', 'https://mb-partners.app/app/cases/ba86641f-1461-48c5-8908-0f287a7a4299', 'partner'],
  ['app_rewards', 'https://mb-partners.app/app/rewards', 'partner'],
  ['console_deals', 'https://console.mb-partners.app/console/deals', 'admin'],
  ['console_home', 'https://console.mb-partners.app/console', 'admin'],
]

const browser = await chromium.launch()
const pCookies = await cookies('kthk.kmbr@gmail.com', 'mb-auth-app', 'mb-partners.app')
const aCookies = await cookies('mediabirth.project@gmail.com', 'mb-auth-console', 'console.mb-partners.app')

const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
console.log('page\tTTFB(ms)\tFCP(ms)\tLCP(ms)')
for (const [name, url, who] of PAGES) {
  const ttfbs = [], fcps = [], lcps = []
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } })
    await ctx.addCookies(who === 'partner' ? pCookies : aCookies)
    const page = await ctx.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 60000 })
    await page.waitForTimeout(2500)
    const m = await page.evaluate(() => new Promise(res => {
      const nav = performance.getEntriesByType('navigation')[0]
      const fcp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null
      let lcp = null
      try {
        const po = new PerformanceObserver(() => {})
        const entries = performance.getEntriesByType('largest-contentful-paint')
        lcp = entries.length ? entries[entries.length - 1].startTime : null
      } catch {}
      if (lcp == null) {
        try {
          new PerformanceObserver(list => {
            const e = list.getEntries(); if (e.length) lcp = e[e.length - 1].startTime
          }).observe({ type: 'largest-contentful-paint', buffered: true })
        } catch {}
      }
      setTimeout(() => res({ ttfb: nav ? nav.responseStart : null, fcp, lcp }), 300)
    }))
    if (m.ttfb) ttfbs.push(m.ttfb); if (m.fcp) fcps.push(m.fcp); if (m.lcp) lcps.push(m.lcp)
    await ctx.close()
  }
  console.log(`${name}\t${Math.round(med(ttfbs) ?? -1)}\t${Math.round(med(fcps) ?? -1)}\t${lcps.length ? Math.round(med(lcps)) : '—'}`)
}
await browser.close()
