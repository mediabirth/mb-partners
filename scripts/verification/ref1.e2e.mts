/** REF-1 browser proof. Dedicated throwaway users/deals only; CC_MAIL_SUPPRESS=1 server required. */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Page } from 'playwright'
import { launchChromium } from './playwright-launch.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const at = line.indexOf('='); return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
}))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const BASE = process.env.BASE_APP || 'http://localhost:4599'
const PASSWORD = 'CcRef1!2026xx'
const PARTNER_EMAIL = 'cc-ref1-partner@mb-system.internal'
const OWNER_EMAIL = 'cc-ref1-owner@mb-system.internal'
const PREFIX = 'CCREF1-'
const FAIL_SERVICE = `${PREFIX}FAIL-BRAND`
const FAIL_SERVICE_MENU = `${PREFIX}FAIL-SERVICE`
const FAIL_MENU = `${PREFIX}FAIL-MENU`
let pass = 0; let fail = 0
const ok = (condition: boolean, label: string, detail = '') => condition
  ? (pass++, console.log(`  ✓ ${label}`))
  : (fail++, console.error(`  ✗ ${label}${detail ? `: ${detail}` : ''}`))

async function fixtureUsers() {
  const partnerUser = await admin.auth.admin.createUser({ email: PARTNER_EMAIL, password: PASSWORD, email_confirm: true, app_metadata: { role: 'partner' } })
  const ownerUser = await admin.auth.admin.createUser({ email: OWNER_EMAIL, password: PASSWORD, email_confirm: true, app_metadata: { role: 'owner' } })
  if (!partnerUser.data.user || !ownerUser.data.user) throw partnerUser.error || ownerUser.error || new Error('auth fixture failed')
  await admin.from('profiles').insert([
    { id: partnerUser.data.user.id, name: 'CC-REF1紹介者', email: PARTNER_EMAIL, role: 'partner', color: '#777777' },
    { id: ownerUser.data.user.id, name: 'CC-REF1運営', email: OWNER_EMAIL, role: 'owner', color: '#777777' },
  ])
  const partner = await admin.from('partners').insert({ profile_id: partnerUser.data.user.id, code: 'CCREF1', status: 'active' }).select('id').single()
  if (!partner.data) throw partner.error || new Error('partner fixture failed')
  return { partnerId: partner.data.id }
}

async function removeFailMenu() {
  const service = (await admin.from('services').select('id').eq('name', FAIL_SERVICE).maybeSingle()).data
  if (!service) return
  const serviceMenuIds = ((await admin.from('service_menus').select('id').eq('service_id', service.id)).data ?? []).map(row => row.id)
  if (serviceMenuIds.length) {
    const menuIds = ((await admin.from('menus').select('id').in('service_menu_id', serviceMenuIds)).data ?? []).map(row => row.id)
    if (menuIds.length) {
      await admin.from('menu_rewards').delete().in('menu_id', menuIds)
      await admin.from('menus').delete().in('id', menuIds)
    }
    await admin.from('service_menus').delete().in('id', serviceMenuIds)
  }
  await admin.from('services').delete().eq('id', service.id)
}

async function addFailMenu() {
  await removeFailMenu()
  const service = await admin.from('services').insert({ name: FAIL_SERVICE, active: true, icon: '', color: '#777777', sort: 999 }).select('id').single()
  if (!service.data) throw service.error || new Error('fail service fixture failed')
  const serviceMenu = await admin.from('service_menus').insert({ service_id: service.data.id, name: FAIL_SERVICE_MENU, sort: 0, ref_type: 'fixed', ref_value: 1 }).select('id').single()
  if (!serviceMenu.data) throw serviceMenu.error || new Error('fail service menu fixture failed')
  const menu = await admin.from('menus').insert({ service_menu_id: serviceMenu.data.id, name: FAIL_MENU, active: true, sort: 0 }).select('id').single()
  if (!menu.data) throw menu.error || new Error('fail menu fixture failed')
  const reward = await admin.from('menu_rewards').insert({ menu_id: menu.data.id, reward_type: 'fixed', reward_value: 1, reward_base: '粗利', sort: 0, active: true })
  if (reward.error) throw reward.error
}

async function cleanup() {
  const { data: deals } = await admin.from('deals').select('id').like('customer_name', `${PREFIX}%`)
  const ids = (deals ?? []).map(row => row.id)
  if (ids.length) {
    await admin.from('delivery_expenses').delete().in('deal_id', ids).then(() => {}, () => {})
    await admin.from('delivery_assignments').delete().in('deal_id', ids)
    await admin.from('deal_tasks').delete().in('deal_id', ids)
    await admin.from('deal_events').delete().in('deal_id', ids)
    await admin.from('deal_items').delete().in('deal_id', ids)
    await admin.from('deals').delete().in('id', ids)
  }
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const user of users.data.users.filter(item => item.email === PARTNER_EMAIL || item.email === OWNER_EMAIL)) {
    await admin.from('audit_logs').delete().eq('actor_profile_id', user.id).then(() => {}, () => {})
    await admin.from('partners').delete().eq('profile_id', user.id)
    await admin.from('profiles').delete().eq('id', user.id)
    await admin.auth.admin.deleteUser(user.id)
  }
  await removeFailMenu()
}

async function login(page: Page, path: '/login' | '/console/login', email: string) {
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.locator('button[type="submit"]').click()
  await page.waitForTimeout(1800)
}

type Pick = { serviceName: string; menuName: string }
async function choose(page: Page, pick: Pick) {
  const card = page.locator('.ob-card').filter({ hasText: pick.serviceName }).first()
  await card.locator(':scope > button').first().click()
  await card.locator('button').filter({ hasText: pick.menuName }).last().click()
}

async function fillCommon(page: Page, customer: string, consult = false) {
  await page.getByPlaceholder('山田 太郎').first().fill(customer)
  await page.getByPlaceholder('09012345678').fill('09012345678')
  if (consult) {
    await page.getByRole('button', { name: '集客', exact: true }).click()
    await page.getByRole('button', { name: 'すぐ', exact: true }).click()
    await page.getByPlaceholder('いま困っていることを教えてください').fill('集客の順序を相談したい')
  }
  for (const checkbox of await page.locator('form input[type="checkbox"]').all()) await checkbox.check()
}

await cleanup()
let browser = await launchChromium({ headless: true })
try {
  await fixtureUsers()
  // /api/services is intentionally shared-cached. Seed before its first request so the
  // selected throwaway remains visible after DB removal for the partial-failure probe.
  await addFailMenu()
  const services = (await admin.from('services').select('id,name').eq('active', true).order('sort')).data ?? []
  const serviceMenus = (await admin.from('service_menus').select('id,service_id')).data ?? []
  const menus = (await admin.from('menus').select('id,service_menu_id,name').eq('active', true).order('sort')).data ?? []
  const rewards = (await admin.from('menu_rewards').select('id,menu_id').eq('active', true).order('sort')).data ?? []
  const candidates = menus.flatMap(menu => {
    const serviceMenu = serviceMenus.find(row => row.id === menu.service_menu_id)
    const service = services.find(row => row.id === serviceMenu?.service_id)
    return service && service.name !== FAIL_SERVICE && rewards.some(row => row.menu_id === menu.id) ? [{ serviceId: service.id, serviceName: service.name, menuName: menu.name }] : []
  })
  const first = candidates[0]
  const second = candidates.find(item => item.serviceId !== first?.serviceId)
  if (!first || !second) throw new Error('different-brand menu fixture not found')

  const partnerContext = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const page = await partnerContext.newPage()
  await login(page, '/login', PARTNER_EMAIL)

  // 2 menus across brands + consultation => 3 deals in one group.
  await page.goto(BASE + '/app/refer', { waitUntil: 'domcontentloaded' })
  await choose(page, first); await choose(page, second)
  await page.getByRole('button', { name: /まだ決まっていない/ }).click()
  await page.getByRole('button', { name: 'この内容で紹介する（3件）' }).click()
  await fillCommon(page, `${PREFIX}GROUP`, true)
  await page.getByRole('button', { name: '3件を紹介する' }).click()
  await page.waitForURL(/\/app\/cases\?group=/, { timeout: 45_000 })
  const grouped = (await admin.from('deals').select('id,referral_group_id,is_consultation,consult_meta,reward_snapshot').eq('customer_name', `${PREFIX}GROUP`).order('created_at')).data ?? []
  ok(grouped.length === 3, '2メニュー＋相談から3案件を起票', String(grouped.length))
  ok(new Set(grouped.map(row => row.referral_group_id)).size === 1 && Boolean(grouped[0]?.referral_group_id), '3案件が同じreferral_group_id')
  ok(grouped.filter(row => row.is_consultation).length === 1 && grouped.find(row => row.is_consultation)?.consult_meta?.temperature === 'すぐ', '相談3問をconsult_metaへ保存')
  ok(grouped.filter(row => !row.is_consultation).every(row => row.reward_snapshot), '2メニューとも既存reward_snapshotを凍結')
  await page.getByText('同時に紹介した3件').waitFor({ timeout: 35_000 })
  ok(await page.getByText('同時に紹介した3件').isVisible(), 'APP案件一覧を顧客見出し＋子カードで表示')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(overflow <= 0, `APP 375px横溢れゼロ (${overflow}px)`)
  await page.screenshot({ path: '/private/tmp/ref1-app-group-375.png', fullPage: true })

  // Delete a selected throwaway menu immediately before submit: first is retained and retry UI names the truth.
  await page.goto(BASE + '/app/refer', { waitUntil: 'domcontentloaded' }); await choose(page, first)
  await choose(page, { serviceName: FAIL_SERVICE, menuName: FAIL_MENU })
  await page.getByRole('button', { name: 'この内容で紹介する（2件）' }).click()
  await fillCommon(page, `${PREFIX}PARTIAL`)
  await removeFailMenu()
  await page.getByRole('button', { name: '2件を紹介する', exact: true }).click()
  try {
    await page.getByText('2件中1件を登録しました').waitFor({ timeout: 35_000 })
  } catch (error) {
    const state = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 800)
    throw new Error(`部分失敗表示を確認できません: ${state}`, { cause: error })
  }
  ok((await admin.from('deals').select('id', { count: 'exact', head: true }).eq('customer_name', `${PREFIX}PARTIAL`)).count === 1, '部分失敗は成功1件を保持')
  ok(await page.getByRole('button', { name: '登録できなかった内容を再試行する' }).isVisible(), '失敗分だけの再試行導線')

  // Legacy single UX remains a single ungrouped deal.
  await page.goto(BASE + '/app/refer', { waitUntil: 'domcontentloaded' }); await choose(page, first)
  await page.getByRole('button', { name: 'この内容で紹介する', exact: true }).click()
  await fillCommon(page, `${PREFIX}SINGLE`)
  await page.getByRole('button', { name: '紹介する', exact: true }).click()
  await page.waitForURL(/\/app\/cases\/[0-9a-f-]+/, { timeout: 35_000 })
  const single = (await admin.from('deals').select('referral_group_id,reward_snapshot').eq('customer_name', `${PREFIX}SINGLE`).single()).data
  ok(single?.referral_group_id == null && Boolean(single?.reward_snapshot), '単選は従来どおり非グループ＋snapshot凍結')

  // Codex single-process fallback is intentionally short-lived; isolate the console proof.
  await partnerContext.close()
  await browser.close()
  browser = await launchChromium({ headless: true })
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const consolePage = await ownerContext.newPage()
  await login(consolePage, '/console/login', OWNER_EMAIL)
  const consultationDeal = grouped.find(row => row.is_consultation)
  if (consultationDeal) {
    await consolePage.goto(`${BASE}/console/deals?deal=${consultationDeal.id}`, { waitUntil: 'domcontentloaded' })
    await consolePage.getByText('同時紹介:', { exact: true }).waitFor({ timeout: 35_000 })
    ok(await consolePage.getByText('同時紹介:', { exact: true }).isVisible(), 'consoleドロワーで同時紹介の組を表示')
    const response = await consolePage.evaluate(async id => (await fetch('/api/console/deals')).json().then(body => body.deals.find((deal: { id: string }) => deal.id === id)), consultationDeal.id)
    ok(response?.consult_meta?.areas?.includes('集客'), 'console APIへconsult_metaを配線')
  }
  await ownerContext.close()
} finally {
  await browser.close().catch(() => {})
  await cleanup()
  const residue = await admin.from('deals').select('id').like('customer_name', `${PREFIX}%`)
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ok((residue.data ?? []).length === 0 && !users.data.users.some(user => user.email === PARTNER_EMAIL || user.email === OWNER_EMAIL), 'REF-1 fixture残置ゼロ')
}

console.log(`\nREF-1 E2E: pass=${pass} fail=${fail}`)
process.exit(fail ? 1 : 0)
