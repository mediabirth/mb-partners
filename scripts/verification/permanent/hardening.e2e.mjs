#!/usr/bin/env node
/**
 * 恒久回帰: アカウント自己管理（APP/vendor/サプライヤー）と公開フォーム防御。
 * 専用throwawayだけを生成し、成功・失敗を問わず全行撤去する。
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
const OLD_PASSWORD = 'HardeningOld!2026'
const NEW_PASSWORD = 'HardeningNew!2026'
const PERSONAS = {
  partner: {
    oldEmail: 'cc-hard1-partner-old@mb-system.internal',
    newEmail: 'cc-hard1-partner-new@mb-system.internal',
    role: 'partner',
    name: '自己管理検証パートナー',
    login: '/login',
    profile: '/app/mypage',
    home: '/app',
  },
  vendor: {
    oldEmail: 'cc-hard1-vendor-old@mb-system.internal',
    newEmail: 'cc-hard1-vendor-new@mb-system.internal',
    role: 'vendor',
    name: '自己管理検証委託先',
    login: '/vendor/login',
    profile: '/vendor/mypage',
    home: '/vendor',
  },
  supplier: {
    oldEmail: 'cc-hard1-supplier-old@mb-system.internal',
    newEmail: 'cc-hard1-supplier-new@mb-system.internal',
    role: 'partner',
    name: '自己管理検証サプライヤー',
    login: '/login',
    profile: '/app/s/settings',
    home: '/app',
  },
}
const DELIVERY_NAME = '自己管理検証委託先（throwaway）'
const REF_TOKEN = 'cc-hard1-public-referral-token'
const APPLICATION_EMAIL = 'cc-hard1-application@mb-system.internal'
const RUN_HEX = Date.now().toString(16).slice(-8)

let passed = 0
let failed = 0
function ok(condition, label, detail = '') {
  if (condition) {
    passed += 1
    console.log('  ✓', label)
  } else {
    failed += 1
    console.log('  ✗', label, String(detail).slice(0, 240))
  }
}

async function users() {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) throw error
  return data.users
}

async function teardown() {
  const { data: deals } = await admin.from('deals').select('id').like('customer_name', 'HARD1%')
  for (const deal of deals ?? []) {
    await admin.from('deal_events').delete().eq('deal_id', deal.id)
    await admin.from('deal_items').delete().eq('deal_id', deal.id)
    await admin.from('notifications').delete().contains('ref', { type: 'deal', id: deal.id })
    await admin.from('audit_logs').delete().contains('meta', { deal_id: deal.id })
  }
  await admin.from('funnel_events').delete().eq('token', REF_TOKEN)
  await admin.from('deals').delete().like('customer_name', 'HARD1%')
  await admin.from('referral_links').delete().eq('token', REF_TOKEN)
  await admin.from('partner_applications').delete().ilike('email', 'cc-hard1-application%@mb-system.internal')

  // referral_linkを先に外してから本人行を削除（FKでpartner削除が止まるのを防ぐ）。
  const all = await users().catch(() => [])
  const fixtureUsers = all.filter(user => Object.values(PERSONAS).some(p =>
    user.email === p.oldEmail || user.email === p.newEmail
  ))
  for (const user of fixtureUsers) {
    await admin.from('deliveries').delete().eq('auth_user_id', user.id)
    await admin.from('partners').delete().eq('profile_id', user.id)
    await admin.from('profiles').delete().eq('id', user.id)
    await admin.auth.admin.deleteUser(user.id)
  }
}

async function createFixtures() {
  await teardown()
  const created = {}
  for (const [kind, p] of Object.entries(PERSONAS)) {
    const made = await admin.auth.admin.createUser({
      email: p.oldEmail,
      password: OLD_PASSWORD,
      email_confirm: true,
      app_metadata: { role: p.role },
    })
    if (made.error || !made.data.user) throw made.error ?? new Error(`create ${kind}`)
    created[kind] = made.data.user.id
    const profile = await admin.from('profiles').upsert({
      id: made.data.user.id,
      email: p.oldEmail,
      name: p.name,
      role: p.role,
      color: '#888888',
    })
    if (profile.error) throw profile.error
    if (kind === 'partner' || kind === 'supplier') {
      const partner = await admin.from('partners').insert({
        profile_id: made.data.user.id,
        code: kind === 'supplier' ? 'CCH1SP' : 'CCH1PT',
        status: 'active',
        supplier_rate_card: kind === 'supplier' ? 'standard-v2' : null,
      }).select('id').single()
      if (partner.error) throw partner.error
      created[`${kind}Partner`] = partner.data.id
    } else {
      const delivery = await admin.from('deliveries').insert({
        name: DELIVERY_NAME,
        kind: 'エンジニア',
        active: true,
        service_id: 'dx',
        contact_email: p.oldEmail,
        auth_user_id: made.data.user.id,
      })
      if (delivery.error) throw delivery.error
    }
  }
  const { data: service } = await admin.from('services').select('id').eq('active', true).limit(1).single()
  if (!service) throw new Error('active service not found')
  const link = await admin.from('referral_links').insert({
    token: REF_TOKEN,
    partner_id: created.partnerPartner,
    service_id: service.id,
  })
  if (link.error) throw link.error
}

async function login(page, persona, email, password) {
  await page.goto(APP + persona.login, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.getByLabel('メールアドレス', { exact: true }).fill(email)
  await page.getByLabel('パスワード', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(url => new URL(url).pathname === persona.home, { timeout: 20_000 }).catch(() => {})
}

async function runPersona(page, context, kind, persona) {
  await context.clearCookies()
  await login(page, persona, persona.oldEmail, OLD_PASSWORD)
  ok(new URL(page.url()).pathname === persona.home, `${kind}: 初期ログイン`)
  await page.goto(APP + persona.profile, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(900)
  const openPassword = page.getByRole('button', { name: 'パスワードを変更', exact: true })
  await openPassword.click()
  const currentField = page.getByLabel('現在のパスワード', { exact: true })
  await currentField.waitFor({ state: 'visible', timeout: 2_000 }).catch(async () => {
    console.log('  account debug:', (await page.locator('[data-account-security]').innerText()).replaceAll('\n', ' / '))
    await openPassword.click()
    await currentField.waitFor({ state: 'visible', timeout: 5_000 })
  })
  await page.getByRole('button', { name: '変更する', exact: true }).last().click()
  ok(await page.locator('input[aria-invalid="true"]').count() === 3, `${kind}: パスワード欄別エラー3件`)
  await currentField.fill(OLD_PASSWORD)
  await page.getByLabel('新しいパスワード', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('新しいパスワード（確認）', { exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: '変更する', exact: true }).last().click()
  await page.getByText('パスワードを変更しました', { exact: true }).waitFor({ state: 'visible' })
  ok(new URL(page.url()).pathname === persona.profile, `${kind}: 変更後も再ログイン不要`)

  await context.clearCookies()
  await login(page, persona, persona.oldEmail, OLD_PASSWORD)
  ok(await page.getByText('メールアドレスまたはパスワードが正しくありません。', { exact: true }).isVisible(), `${kind}: 旧パスワード無効`)
  await page.getByLabel('パスワード', { exact: true }).fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(url => new URL(url).pathname === persona.home, { timeout: 20_000 })

  await page.goto(APP + persona.profile, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: '変更する', exact: true }).last().click()
  await page.getByLabel('新しいメールアドレス', { exact: true }).fill(persona.newEmail)
  await page.getByRole('button', { name: '確認メールを送る', exact: true }).click()
  await page.getByText('現在と新しいメールアドレスに確認リンクをお送りしました', { exact: true }).waitFor({ state: 'visible' })
  const currentLink = await page.locator('[data-email-change-debug] a[data-stage="current"]').getAttribute('href')
  const nextLink = await page.locator('[data-email-change-debug] a[data-stage="new"]').getAttribute('href')
  ok(!!currentLink && !!nextLink, `${kind}: 抑止下で新旧確認リンク2本`)
  await page.goto(currentLink, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-email-change-state="pending"]').waitFor({ state: 'visible', timeout: 10_000 })
  await page.goto(nextLink, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-email-change-state="completed"]').waitFor({ state: 'visible', timeout: 10_000 })

  const updated = (await users()).find(user => user.email === persona.newEmail)
  const { data: profile } = updated
    ? await admin.from('profiles').select('email').eq('id', updated.id).single()
    : { data: null }
  ok(updated?.email === persona.newEmail && profile?.email === persona.newEmail, `${kind}: auth+profiles email一致`)

  await context.clearCookies()
  await login(page, persona, persona.oldEmail, NEW_PASSWORD)
  ok(await page.getByText('メールアドレスまたはパスワードが正しくありません。', { exact: true }).isVisible(), `${kind}: 旧メール無効`)
  await page.getByLabel('メールアドレス', { exact: true }).fill(persona.newEmail)
  await page.getByRole('button', { name: 'ログイン', exact: true }).click()
  await page.waitForURL(url => new URL(url).pathname === persona.home, { timeout: 20_000 })
  ok(new URL(page.url()).pathname === persona.home, `${kind}: 新メールでログイン`)

  await page.goto(APP + persona.profile, { waitUntil: 'domcontentloaded' })
  const overflow = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth)
  ok(overflow === 0, `${kind}: 375px横溢れ0`, overflow)
}

async function publicFormChecks() {
  const referralBody = index => ({
    token: REF_TOKEN,
    customerName: `HARD1正常${index}`,
    contactName: `HARD1正常${index}`,
    customerEmail: '',
    customerType: 'individual',
    phone: '09000000000',
    memo: '',
    via: 'link',
    website: '',
  })
  const bot = await fetch(APP + '/api/referral', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.21' },
    body: JSON.stringify({ ...referralBody('BOT'), website: 'https://spam.example' }),
  })
  const { count: botDeals } = await admin.from('deals').select('id', { count: 'exact', head: true }).eq('customer_name', 'HARD1正常BOT')
  ok(bot.status === 200 && botDeals === 0, 'referral: honeypot静かな破棄')

  const statuses = []
  for (let index = 1; index <= 6; index += 1) {
    const response = await fetch(APP + '/api/referral', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `2001:db8:${RUN_HEX.slice(-4)}::22` },
      body: JSON.stringify(referralBody(index)),
    })
    statuses.push(response.status)
  }
  ok(statuses.slice(0, 5).every(status => status === 200) && statuses[5] === 429, 'referral: 5分5回・6回目制限', statuses.join(','))

  const application = suffix => ({
    name: `HARD1応募${suffix}`,
    email: APPLICATION_EMAIL.replace('@', `+${suffix}@`),
    phone: '09000000000',
    org: '',
    expertise: '',
    message: '',
    consent: true,
    website: '',
  })
  const botApplication = await fetch(APP + '/api/partner-apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.31' },
    body: JSON.stringify({ ...application('bot'), website: 'spam' }),
  })
  const { count: botApplications } = await admin.from('partner_applications').select('id', { count: 'exact', head: true }).ilike('email', '%+bot@mb-system.internal')
  ok(botApplication.status === 200 && botApplications === 0, 'partner-apply: honeypot静かな破棄')

  const repeated = application('rate')
  const applicationStatuses = []
  for (let index = 1; index <= 6; index += 1) {
    const response = await fetch(APP + '/api/partner-apply', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': `2001:db8:${RUN_HEX.slice(-4)}::32` },
      body: JSON.stringify(repeated),
    })
    applicationStatuses.push(response.status)
  }
  ok(applicationStatuses.slice(0, 5).every(status => status === 200) && applicationStatuses[5] === 429, 'partner-apply: 5分5回・6回目制限', applicationStatuses.join(','))
  const overlong = await fetch(APP + '/api/partner-apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.33' },
    body: JSON.stringify({ ...application('long'), name: 'x'.repeat(201) }),
  })
  ok(overlong.status === 400, '公開フォーム: 長さ上限を明示拒否')
}

async function main() {
  if (process.env.CC_MAIL_SUPPRESS !== '1') throw new Error('CC_MAIL_SUPPRESS=1 is required')
  await createFixtures()
  let browser
  try {
    browser = await launchChromium()
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } })
    const page = await context.newPage()
    for (const [kind, persona] of Object.entries(PERSONAS)) await runPersona(page, context, kind, persona)
    await publicFormChecks()
    await context.close()
  } finally {
    await browser?.close().catch(() => {})
    await teardown()
  }
  const leftovers = (await users()).filter(user => Object.values(PERSONAS).some(p =>
    user.email === p.oldEmail || user.email === p.newEmail
  ))
  ok(leftovers.length === 0, 'hardening auth.users残置0', leftovers.map(user => user.email).join(','))
  const { count: dealCount } = await admin.from('deals').select('id', { count: 'exact', head: true }).like('customer_name', 'HARD1%')
  const { count: applicationCount } = await admin.from('partner_applications').select('id', { count: 'exact', head: true }).ilike('email', 'cc-hard1-application%@mb-system.internal')
  ok(dealCount === 0 && applicationCount === 0, '公開フォームfixture残置0', `${dealCount}/${applicationCount}`)
  console.log(`\nHARDENING: ${passed} passed / ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main().catch(async error => {
  console.error('HARDENING FATAL:', error instanceof Error ? error.stack : error)
  await teardown().catch(() => {})
  process.exit(1)
})
