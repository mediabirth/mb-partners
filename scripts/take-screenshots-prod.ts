/**
 * Production screenshot verification — mb-partners.app
 * Admin: extracts session token from magic link hash fragment
 * Partner: injects session cookie directly via signInWithPassword
 */
import { chromium } from 'playwright'
import { createClient } from '@supabase/supabase-js'
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

const BASE          = 'https://mb-partners.app'
const OUT_DIR       = resolve(__dirname, '../docs/reports/review_screens/prod')
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const ADMIN_EMAIL   = process.env.SCREENSHOT_ADMIN_EMAIL!
const PARTNER_EMAIL = process.env.SCREENSHOT_PARTNER_EMAIL!
const PARTNER_PASS  = process.env.SCREENSHOT_PARTNER_PASSWORD!

mkdirSync(OUT_DIR, { recursive: true })

const svc  = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = createClient(SUPABASE_URL, ANON_KEY,    { auth: { autoRefreshToken: false, persistSession: false } })

function makeSessionCookies(session: { access_token: string; refresh_token: string; expires_in?: number; expires_at?: number; token_type?: string; user?: object }) {
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const key        = `sb-${projectRef}-auth-token`
  const json       = JSON.stringify(session)
  const value      = `base64-${Buffer.from(json, 'utf-8').toString('base64url')}`
  return [{ name: key, value, url: BASE, httpOnly: false, secure: true, sameSite: 'Lax' as const }]
}

function parseHash(url: string): Record<string, string> {
  const hashIdx = url.indexOf('#')
  if (hashIdx === -1) return {}
  const hash = url.slice(hashIdx + 1)
  return Object.fromEntries(new URLSearchParams(hash).entries())
}

async function shot(page: any, url: string, name: string) {
  await page.goto(`${BASE}${url}`)
  await page.waitForTimeout(2500)
  const path = `${OUT_DIR}/${name}.png`
  await page.screenshot({ path, fullPage: true })
  const finalUrl = page.url()
  const ok = finalUrl.startsWith(`${BASE}${url.split('?')[0]}`)
  console.log(`  ${ok ? '✓' : '⚠ REDIRECT'} ${url}${ok ? '' : ` → ${finalUrl.replace(BASE, '')}`}`)
  return { url, name, ok, finalUrl }
}

async function main() {
  const browser = await chromium.launch()
  const results: any[] = []

  // ── Admin console via magic link token extraction ──────────────────────────
  {
    console.log('\n[Admin: magic link → token extraction]')
    const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
      type: 'magiclink',
      email: ADMIN_EMAIL,
      options: { redirectTo: `${BASE}/login` }, // redirect to a page we can check
    })
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('  generateLink error:', linkErr?.message)
    } else {
      // Visit action_link in a temporary context to extract the hash tokens
      const tmpCtx  = await browser.newContext()
      const tmpPage = await tmpCtx.newPage()
      await tmpPage.goto(linkData.properties.action_link)
      await tmpPage.waitForTimeout(3000)
      const redirectedUrl = tmpPage.url()
      console.log('  Redirected to:', redirectedUrl.replace(BASE, ''))

      const tokens = parseHash(redirectedUrl)
      await tmpCtx.close()

      if (tokens.access_token) {
        console.log('  access_token extracted ✓')
        // Decode JWT to get user info
        const payloadB64 = tokens.access_token.split('.')[1]
        const payload    = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())

        const session = {
          access_token:  tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type:    'bearer',
          expires_in:    Number(tokens.expires_in ?? 3600),
          expires_at:    Number(tokens.expires_at ?? (Math.floor(Date.now() / 1000) + 3600)),
          user: {
            id:       payload.sub,
            email:    payload.email,
            role:     'authenticated',
            aal:      payload.aal,
          },
        }
        const cookies = makeSessionCookies(session)
        const ctx     = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        await ctx.addCookies(cookies)
        const page    = await ctx.newPage()

        await page.goto(`${BASE}/console`)
        await page.waitForTimeout(2500)
        const consoleUrl = page.url()
        const consoleOk  = !consoleUrl.includes('/login')
        console.log(`  /console → ${consoleUrl.replace(BASE, '')} (${consoleOk ? '✓' : '⚠ not authed'})`)

        if (consoleOk) {
          console.log('\n[Console pages — production]')
          for (const [url, name] of [
            ['/console',            'prod_console_dashboard'],
            ['/console/deals',      'prod_console_deals'],
            ['/console/partners',   'prod_console_partners'],
            ['/console/services',   'prod_console_services'],
            ['/console/payouts',    'prod_console_payouts'],
            ['/console/broadcasts', 'prod_console_broadcasts'],
            ['/console/inquiries',  'prod_console_inquiries'],
            ['/console/settings',   'prod_console_settings'],
          ] as const) {
            results.push(await shot(page, url, name))
          }
        } else {
          await page.screenshot({ path: `${OUT_DIR}/prod_admin_auth_failed.png`, fullPage: true })
          console.log('  Saved auth-failed screenshot')
        }
        await ctx.close()
      } else {
        console.error('  No access_token in hash. Redirected URL:', redirectedUrl)
        // Still take screenshots of what the redirect showed
        const tmpCtx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } })
        const tmpPage2 = await tmpCtx2.newPage()
        await tmpPage2.goto(redirectedUrl)
        await tmpPage2.screenshot({ path: `${OUT_DIR}/prod_admin_notoken.png`, fullPage: true })
        await tmpCtx2.close()
      }
    }
  }

  // ── Partner app ────────────────────────────────────────────────────────────
  {
    console.log('\n[Partner: sign in with password]')
    const { data: partnerAuth, error: partnerErr } = await anon.auth.signInWithPassword({
      email: PARTNER_EMAIL, password: PARTNER_PASS,
    })
    if (partnerErr || !partnerAuth?.session) {
      console.error('  Partner sign-in error:', partnerErr?.message)
    } else {
      const cookies = makeSessionCookies(partnerAuth.session)
      const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } })
      await ctx.addCookies(cookies)
      const page = await ctx.newPage()
      await page.goto(`${BASE}/app`)
      await page.waitForTimeout(2000)
      const appUrl = page.url()
      console.log(`  /app → ${appUrl.replace(BASE, '')}`)

      if (!appUrl.includes('/login')) {
        console.log('\n[Partner pages — production]')
        for (const [url, name] of [
          ['/app',         'prod_app_home'],
          ['/app/cases',   'prod_app_cases'],
          ['/app/refer',   'prod_app_refer'],
          ['/app/guide',   'prod_app_guide'],
          ['/app/rewards', 'prod_app_rewards'],
          ['/app/inbox',   'prod_app_inbox'],
          ['/app/mypage',  'prod_app_mypage'],
        ] as const) {
          results.push(await shot(page, url, name))
        }
      }
      await ctx.close()
    }
  }

  await browser.close()

  console.log('\n=== PRODUCTION RESULT ===')
  const ok  = results.filter(r => r.ok)
  const bad = results.filter(r => !r.ok)
  console.log(`✓ OK:       ${ok.length} / ${results.length}`)
  if (bad.length) {
    console.log(`⚠ Problems:`)
    bad.forEach(r => console.log(`  ${r.url} → ${r.finalUrl}`))
  } else if (results.length > 0) {
    console.log('✓ No redirects — all pages loaded correctly')
  }
  console.log(`\nScreenshots: ${OUT_DIR}`)
}

main().catch(e => { console.error(e); process.exit(1) })
