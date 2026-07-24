#!/usr/bin/env node
/**
 * 恒久回帰: 3面パスワード再設定。
 * 専用throwawayだけを作成し、要求→token_hash交換→更新→新旧ログイン→面分離を実UIで通す。
 * run-permanent が CC_MAIL_SUPPRESS=1 を強制するため実送信は常に0件。
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { launchChromium } from '../playwright-launch.mjs'

const env = Object.fromEntries(readFileSync(new URL('../../../.env.local', import.meta.url), 'utf8')
  .split('\n').filter(line => line.includes('=')).map(line => {
    const index = line.indexOf('=')
    return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
  }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const APP = process.env.BASE_APP || 'https://mb-partners.app'
const CONSOLE = process.env.BASE_CONSOLE || 'https://console.mb-partners.app'
const OLD_PASSWORD = 'OldReset!2026'
const ACCOUNTS = {
  app: {
    email: 'cc-reset-app-throwaway@mb-system.internal',
    role: 'partner',
    name: '再設定検証パートナー',
    forgot: '/forgot-password',
    reset: '/reset-password',
    login: '/login',
    home: '/app',
    next: 'AppReset!2026',
  },
  vendor: {
    email: 'cc-reset-vendor-throwaway@mb-system.internal',
    role: 'vendor',
    name: '再設定検証委託先',
    forgot: '/vendor/forgot-password',
    reset: '/vendor/reset-password',
    login: '/vendor/login',
    home: '/vendor',
    next: 'VendorReset!2026',
  },
  console: {
    email: 'cc-reset-console-throwaway@mb-system.internal',
    role: 'manager',
    name: '再設定検証運営',
    forgot: '/console/forgot-password',
    reset: '/console/reset-password',
    login: '/console/login',
    home: '/console',
    next: 'ConsoleReset!2026',
  },
}
const NONEXISTENT = 'cc-reset-missing-throwaway@mb-system.internal'
const DELIVERY_NAME = '再設定検証委託先（throwaway）'

let passed = 0
let failed = 0
function ok(condition, label, detail = '') {
  if (condition) {
    passed++
    console.log('  ✓', label)
  } else {
    failed++
    console.log('  ✗', label, String(detail).slice(0, 240))
  }
}

async function users() {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users
}

async function ensureFixtures() {
  const existing = await users()
  for (const [surface, account] of Object.entries(ACCOUNTS)) {
    let user = existing.find(candidate => candidate.email === account.email)
    if (!user) {
      const created = await admin.auth.admin.createUser({
        email: account.email,
        password: OLD_PASSWORD,
        email_confirm: true,
        app_metadata: { role: account.role },
      })
      if (created.error || !created.data.user) throw created.error ?? new Error(`create ${surface}`)
      user = created.data.user
    } else {
      const updated = await admin.auth.admin.updateUserById(user.id, {
        password: OLD_PASSWORD,
        app_metadata: { ...user.app_metadata, role: account.role },
      })
      if (updated.error) throw updated.error
    }
    const profile = await admin.from('profiles').upsert({
      id: user.id,
      email: account.email,
      name: account.name,
      role: account.role,
      color: '#888888',
    })
    if (profile.error) throw profile.error
    if (surface === 'app') {
      await admin.from('partners').delete().eq('profile_id', user.id)
      const partner = await admin.from('partners').insert({
        profile_id: user.id,
        code: 'CCRESET',
        status: 'active',
      })
      if (partner.error) throw partner.error
    }
    if (surface === 'vendor') {
      await admin.from('deliveries').delete().eq('auth_user_id', user.id)
      const delivery = await admin.from('deliveries').insert({
        name: DELIVERY_NAME,
        kind: 'エンジニア',
        active: true,
        service_id: 'dx',
        auth_user_id: user.id,
      })
      if (delivery.error) throw delivery.error
    }
  }
}

async function teardownFixtures() {
  const current = await users().catch(() => [])
  for (const account of Object.values(ACCOUNTS)) {
    const user = current.find(candidate => candidate.email === account.email)
    if (!user) continue
    await admin.from('deliveries').delete().eq('auth_user_id', user.id)
    await admin.from('audit_logs').delete().eq('actor_profile_id', user.id)
    await admin.from('partners').delete().eq('profile_id', user.id)
    await admin.from('profiles').delete().eq('id', user.id)
    await admin.auth.admin.deleteUser(user.id)
  }
}

function baseFor(surface) {
  return surface === 'console' ? CONSOLE : APP
}

function isHomePath(pathname, home) {
  return pathname === home || pathname.startsWith(`${home}/`)
}

async function login(page, surface, password) {
  const account = ACCOUNTS[surface]
  await page.goto(baseFor(surface) + account.login, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  const email = surface === 'console'
    ? page.locator('input[type="email"]')
    : page.getByLabel('メールアドレス', { exact: true })
  await email.fill(account.email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  const button = page.getByRole('button', { name: 'ログイン', exact: true })
  await button.click()
  await page.waitForURL(url => new URL(url).pathname === account.home, { timeout: 10_000 }).catch(() => {})
  if (new URL(page.url()).pathname !== account.home && await button.count() === 1) {
    await button.click()
    await page.waitForURL(url => new URL(url).pathname === account.home, { timeout: 20_000 }).catch(() => {})
  }
}

async function isAlive(page, surface) {
  const account = ACCOUNTS[surface]
  await page.goto(baseFor(surface) + account.home, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(400)
  return isHomePath(new URL(page.url()).pathname, account.home)
    && new URL(page.url()).pathname !== account.login
}

async function requestLink(page, surface, email = ACCOUNTS[surface].email) {
  const account = ACCOUNTS[surface]
  await page.goto(baseFor(surface) + account.forgot, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await page.getByLabel('メールアドレス', { exact: true }).fill(email)
  const button = page.getByRole('button', { name: '再設定用リンクを送る', exact: true })
  await button.click()
  await page.waitForTimeout(500)
  let result = page.getByTestId('password-reset-result')
  // hydration前の初回clickが無効だった場合だけ、DOM確認後に1回再送する。
  if (await result.count() !== 1) {
    await button.click()
    await page.waitForTimeout(500)
    result = page.getByTestId('password-reset-result')
  }
  const message = await page.getByRole('status').innerText()
  return {
    message,
    debugLink: await result.getAttribute('data-debug-link'),
    rateLimited: await result.getAttribute('data-rate-limited'),
  }
}

async function resetSurface(page, surface) {
  const account = ACCOUNTS[surface]
  const request = await requestLink(page, surface)
  ok(request.message === '再設定用のリンクをお送りしました（登録がある場合）', `${surface}: 固定成功文言`)
  ok(new URL(request.debugLink).pathname === account.reset, `${surface}: 面別reset URL`, request.debugLink)

  if (surface === 'app') {
    const limited = await requestLink(page, surface)
    ok(limited.rateLimited === 'true', '同一メール5分以内の再要求を制限')
    ok(limited.message === request.message, 'レート制限時も同一文言')
  }

  await page.goto(request.debugLink, { waitUntil: 'domcontentloaded' })
  const update = page.getByRole('button', { name: 'パスワードを更新', exact: true })
  await update.waitFor({ state: 'visible', timeout: 10_000 })
  await update.click()
  ok(await page.locator('input[aria-invalid="true"]').count() === 2, `${surface}: 必須2欄の欄別エラー`)
  ok(await page.getByText('8文字以上で入力してください', { exact: true }).isVisible(), `${surface}: 8文字エラー`)
  ok(await page.getByText('確認用パスワードを入力してください', { exact: true }).isVisible(), `${surface}: 確認欄エラー`)

  await page.getByLabel('新しいパスワード', { exact: true }).fill(account.next)
  await page.getByLabel('新しいパスワード（確認）', { exact: true }).fill(account.next)
  await update.click()
  await page.getByText('パスワードを更新しました。新しいパスワードでログインしてください。', { exact: true })
    .waitFor({ state: 'visible', timeout: 10_000 })

  await login(page, surface, OLD_PASSWORD)
  await page.getByText('メールアドレスまたはパスワードが正しくありません。', { exact: true })
    .waitFor({ state: 'visible', timeout: 10_000 })
  ok(true, `${surface}: 旧パスワード無効`)
  await page.getByLabel('パスワード', { exact: true }).fill(account.next)
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(url => new URL(url).pathname === account.home, { timeout: 20_000 })
  ok(await isAlive(page, surface), `${surface}: 新パスワードでログイン成功`)
}

async function main() {
  if (process.env.CC_MAIL_SUPPRESS !== '1') {
    throw new Error('CC_MAIL_SUPPRESS=1 is required')
  }
  await teardownFixtures()
  await ensureFixtures()
  let browser
  try {
    browser = await launchChromium()
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } })
    const page = await context.newPage()

    console.log('[1] 3面の初期セッションを同一ブラウザに確立')
    for (const surface of Object.keys(ACCOUNTS)) {
      await login(page, surface, OLD_PASSWORD)
      await page.waitForURL(url => new URL(url).pathname === ACCOUNTS[surface].home, { timeout: 20_000 })
      ok(await isAlive(page, surface), `${surface}: 初期ログイン`)
    }

    console.log('[2] 存在しないメールも同一表示')
    const missing = await requestLink(page, 'app', NONEXISTENT)
    ok(missing.message === '再設定用のリンクをお送りしました（登録がある場合）', '不存在メールの固定成功文言')
    ok(!missing.debugLink, '不存在メールにリンクを発行しない')

    console.log('[3] 3面の再設定と他面セッション保全')
    await resetSurface(page, 'app')
    ok(await isAlive(page, 'vendor'), 'app再設定後もvendor生存')
    ok(await isAlive(page, 'console'), 'app再設定後もconsole生存')

    await resetSurface(page, 'vendor')
    ok(await isAlive(page, 'app'), 'vendor再設定後もapp生存')
    ok(await isAlive(page, 'console'), 'vendor再設定後もconsole生存')

    await resetSurface(page, 'console')
    ok(await isAlive(page, 'app'), 'console再設定後もapp生存')
    ok(await isAlive(page, 'vendor'), 'console再設定後もvendor生存')

    console.log('[4] 375px横溢れ')
    for (const [surface, account] of Object.entries(ACCOUNTS)) {
      await page.goto(baseFor(surface) + account.forgot, { waitUntil: 'domcontentloaded' })
      const overflow = await page.evaluate(() =>
        Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
      )
      ok(overflow === 0, `${surface}: forgot 375px横溢れ0`, String(overflow))
    }
    await context.close()
  } finally {
    await browser?.close().catch(() => {})
    await teardownFixtures()
  }

  const leftovers = (await users()).filter(user =>
    Object.values(ACCOUNTS).some(account => account.email === user.email)
  )
  ok(leftovers.length === 0, 'throwaway auth.users残置0', leftovers.map(user => user.email).join(','))
  const { count: deliveryCount } = await admin.from('deliveries')
    .select('id', { count: 'exact', head: true }).eq('name', DELIVERY_NAME)
  ok((deliveryCount ?? 0) === 0, 'throwaway deliveries残置0', String(deliveryCount))

  console.log(`\nPASSWORD-RESET: ${passed} passed / ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async error => {
  console.error('PASSWORD-RESET FATAL:', error instanceof Error ? error.stack : error)
  await teardownFixtures().catch(() => {})
  process.exit(1)
})
