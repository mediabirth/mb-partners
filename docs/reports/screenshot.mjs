/**
 * Playwright full-page screenshot script — partner /app screens only
 * Usage: node --env-file=.env.local docs/reports/screenshot.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const BASE = 'https://mb-partners.app'
const OUT  = resolve(__dirname, 'screens')
mkdirSync(OUT, { recursive: true })

const PARTNER_EMAIL    = process.env.SCREENSHOT_PARTNER_EMAIL
const PARTNER_PASSWORD = process.env.SCREENSHOT_PARTNER_PASSWORD

if (!PARTNER_EMAIL || !PARTNER_PASSWORD) {
  console.error('Missing SCREENSHOT_PARTNER_* env vars')
  process.exit(1)
}

async function shot(page, filename) {
  await page.waitForLoadState('networkidle')
  const path = resolve(OUT, filename)
  await page.screenshot({ path, fullPage: true })
  console.log('  ✓', filename)
}

async function loginPartner(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', PARTNER_EMAIL)
  await page.fill('input[type="password"]', PARTNER_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 20000 })
  await page.waitForLoadState('networkidle')
}

const browser = await chromium.launch({ headless: true })

// ── PARTNER SCREENSHOTS ──────────────────────────────────────────────────────
console.log('\n[PARTNER]')
{
  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()

  await loginPartner(page)

  // /app
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' })
  await shot(page, 'partner_home.png')

  // /app/guide
  await page.goto(`${BASE}/app/guide`, { waitUntil: 'networkidle' })
  await shot(page, 'partner_guide.png')

  // /app/refer — Step 1 (service list)
  await page.goto(`${BASE}/app/refer`, { waitUntil: 'networkidle' })
  await shot(page, 'partner_refer_step1.png')

  // Step 2: click first service card
  const firstCard = page.locator('a[href*="/refer"], button').first()
  const allLinks = page.locator('a')
  const referLinks = page.locator('a[href*="refer"]')
  // Try to find a service card — look for clickable items on the refer page
  const serviceCard = page.locator('a, button').filter({ hasText: /.{2,}/ }).first()
  if (await serviceCard.count() > 0) {
    await serviceCard.click()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    const url2 = page.url()
    await shot(page, 'partner_refer_step2.png')

    // Step 3: click first menu card if still navigating
    if (url2.includes('refer') || url2.includes('step')) {
      const menuCard = page.locator('a, button').filter({ hasText: /.{2,}/ }).first()
      if (await menuCard.count() > 0) {
        await menuCard.click()
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(500)
        await shot(page, 'partner_refer_step3.png')
      }
    }
  } else {
    console.log('  ! refer step2/3: no card found, skipping')
  }

  // /app/cases — list
  await page.goto(`${BASE}/app/cases`, { waitUntil: 'networkidle' })
  await shot(page, 'partner_cases.png')

  // /app/cases/[first] — detail
  const caseLink = page.locator('a[href^="/app/cases/"]').first()
  if (await caseLink.count() > 0) {
    await caseLink.click()
    await page.waitForLoadState('networkidle')
    await shot(page, 'partner_case_detail.png')
  } else {
    console.log('  ! partner_case_detail: no case found, skipping')
  }

  // /app/mypage
  await page.goto(`${BASE}/app/mypage`, { waitUntil: 'networkidle' })
  await shot(page, 'partner_mypage.png')

  // /app/settings
  await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle' })
  await shot(page, 'partner_settings.png')

  // /app/inbox
  await page.goto(`${BASE}/app/inbox`, { waitUntil: 'networkidle' })
  await shot(page, 'partner_inbox.png')

  await ctx.close()
}

await browser.close()
console.log('\nDone. Saved to docs/reports/screens/')
