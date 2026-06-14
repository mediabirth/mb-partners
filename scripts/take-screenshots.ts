/**
 * Local screenshot verification for all console + partner app pages
 * Usage: npx tsx scripts/take-screenshots.ts
 */
import { chromium } from 'playwright'
import { readFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'

function loadEnvLocal() {
  try {
    const content = readFileSync(resolve(__dirname, '../.env.local'), 'utf-8')
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const idx = trimmed.indexOf('=')
      if (idx < 1) continue
      const key = trimmed.slice(0, idx).trim()
      let val = trimmed.slice(idx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1)
      if (!process.env[key]) process.env[key] = val
    }
  } catch { /* ignore */ }
}
loadEnvLocal()

const BASE      = 'http://localhost:3001'
const OUT_DIR   = resolve(__dirname, '../docs/reports/review_screens')
const ADMIN_EMAIL    = process.env.SCREENSHOT_ADMIN_EMAIL!
const ADMIN_PASS     = process.env.SCREENSHOT_ADMIN_PASSWORD!
const PARTNER_EMAIL  = process.env.SCREENSHOT_PARTNER_EMAIL!
const PARTNER_PASS   = process.env.SCREENSHOT_PARTNER_PASSWORD!

mkdirSync(OUT_DIR, { recursive: true })

async function login(page: any, email: string, password: string) {
  // Try console login
  await page.goto(`${BASE}/console/login`)
  await page.waitForSelector('input[type="email"]', { timeout: 5000 }).catch(() => {
    // Try partner login
    return page.goto(`${BASE}/login`)
  })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForNavigation({ timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(1000)
}

async function shot(page: any, url: string, name: string) {
  await page.goto(`${BASE}${url}`)
  await page.waitForTimeout(1500) // allow async data load
  const path = `${OUT_DIR}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  const finalUrl = page.url()
  const redirected = !finalUrl.includes(url.split('?')[0])
  console.log(`  ${redirected ? '⚠ REDIRECT' : '✓'} ${url} → ${name}.png${redirected ? ` (→ ${finalUrl})` : ''}`)
  return { url, name, redirected, finalUrl }
}

async function main() {
  const browser  = await chromium.launch()
  const results: { url: string; name: string; redirected: boolean; finalUrl: string }[] = []

  // ── Admin / Console ───────────────────────────────────────────────────────
  {
    const ctx  = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await ctx.newPage()

    console.log('\n[Admin login]')
    await page.goto(`${BASE}/console/login`)
    await page.waitForSelector('input[type="email"]', { timeout: 8000 })
    await page.fill('input[type="email"]', ADMIN_EMAIL)
    await page.fill('input[type="password"]', ADMIN_PASS)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(3000)
    console.log('  After login URL:', page.url())

    console.log('\n[Console pages]')
    const consolePages = [
      ['/console',             'console_dashboard'],
      ['/console/deals',       'console_deals'],
      ['/console/partners',    'console_partners'],
      ['/console/services',    'console_services'],
      ['/console/payouts',     'console_payouts'],
      ['/console/broadcasts',  'console_broadcasts'],
      ['/console/inquiries',   'console_inquiries'],
      ['/console/settings',    'console_settings'],
    ] as const
    for (const [url, name] of consolePages) {
      results.push(await shot(page, url, name))
    }
    await ctx.close()
  }

  // ── Partner App ───────────────────────────────────────────────────────────
  {
    const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } })
    const page = await ctx.newPage()

    console.log('\n[Partner login]')
    await page.goto(`${BASE}/login`)
    await page.waitForSelector('input[type="email"]', { timeout: 8000 })
    await page.fill('input[type="email"]', PARTNER_EMAIL)
    await page.fill('input[type="password"]', PARTNER_PASS)
    await page.click('button[type="submit"]')
    await page.waitForTimeout(3000)
    console.log('  After login URL:', page.url())

    console.log('\n[Partner app pages]')
    const partnerPages = [
      ['/app',           'app_home'],
      ['/app/cases',     'app_cases'],
      ['/app/refer',     'app_refer'],
      ['/app/guide',     'app_guide'],
      ['/app/rewards',   'app_rewards'],
      ['/app/inbox',     'app_inbox'],
      ['/app/mypage',    'app_mypage'],
      ['/app/settings',  'app_settings'],
      ['/app/support',   'app_support'],
    ] as const
    for (const [url, name] of partnerPages) {
      results.push(await shot(page, url, name))
    }
    await ctx.close()
  }

  await browser.close()

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n=== RESULT SUMMARY ===')
  const ok  = results.filter(r => !r.redirected)
  const bad = results.filter(r => r.redirected)
  console.log(`✓ OK: ${ok.length} pages`)
  if (bad.length) {
    console.log(`⚠ Redirected (${bad.length}):`)
    bad.forEach(r => console.log(`  ${r.url} → ${r.finalUrl}`))
  } else {
    console.log('✓ No unexpected redirects')
  }
  console.log(`\nScreenshots saved to: ${OUT_DIR}`)
}

main().catch(e => { console.error(e); process.exit(1) })
