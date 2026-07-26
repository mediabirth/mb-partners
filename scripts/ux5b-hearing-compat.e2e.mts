/**
 * UX-5b batch regression: an existing deal_task with the legacy label
 * 「ヒヤリング」 is still completed by the current hearing API.
 * All rows are uniquely prefixed throwaway data and removed in finally.
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { launchChromium } from './verification/playwright-launch.mjs'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n')
  .filter(line => line.includes('='))
  .map(line => {
    const i = line.indexOf('=')
    return [line.slice(0, i).trim(), line.slice(i + 1).trim()]
  }))
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const base = process.env.BASE_APP || 'http://localhost:4599'
const email = 'cc-ux5b-hearing-compat@mb-system.internal'
const password = 'CcUx5bHearing!2026'
const prefix = 'CC-UX5B-HC'
let userId: string | null = null
let partnerId: string | null = null
let serviceId: string | null = null
let dealId: string | null = null

async function cleanup() {
  if (!userId) {
    const { data } = await admin.auth.admin.listUsers()
    userId = data?.users.find(user => user.email === email)?.id ?? null
  }
  if (!partnerId && userId) {
    const { data } = await admin.from('partners').select('id').eq('profile_id', userId).maybeSingle()
    partnerId = data?.id ?? null
  }
  if (partnerId) {
    const { data: deals } = await admin.from('deals').select('id').eq('partner_id', partnerId)
    const ids = (deals ?? []).map(row => row.id)
    if (ids.length) {
      await admin.from('deal_tasks').delete().in('deal_id', ids)
      await admin.from('deal_events').delete().in('deal_id', ids)
      await admin.from('deal_items').delete().in('deal_id', ids)
      await admin.from('deals').delete().in('id', ids)
    }
    await admin.from('partners').delete().eq('id', partnerId)
  }
  if (userId) {
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId).catch(() => {})
  }
  await admin.from('services').delete().like('name', `${prefix}%`)
}

let browser: Awaited<ReturnType<typeof launchChromium>> | null = null
try {
  await cleanup()
  userId = null
  partnerId = null

  const made = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'partner' },
  })
  if (made.error || !made.data.user) throw made.error || new Error('createUser failed')
  userId = made.data.user.id
  const { error: profileError } = await admin.from('profiles').insert({
    id: userId,
    name: `${prefix} Partner`,
    role: 'partner',
    email,
    color: '#888888',
  })
  if (profileError) throw profileError
  const partner = await admin.from('partners').insert({
    profile_id: userId,
    code: 'CC5BHC',
    status: 'active',
  }).select('id').single()
  if (partner.error) throw partner.error
  partnerId = partner.data.id

  serviceId = randomUUID()
  const { error: serviceError } = await admin.from('services').insert({
    id: serviceId,
    name: `${prefix}-${serviceId.slice(0, 8)}`,
    active: false,
  })
  if (serviceError) throw serviceError
  const deal = await admin.from('deals').insert({
    partner_id: partnerId,
    service_id: serviceId,
    customer_name: `${prefix} Customer`,
    channel: 'cooperation',
    source: 'partner_form',
    consent: true,
    status: 'received',
  }).select('id').single()
  if (deal.error) throw deal.error
  dealId = deal.data.id
  const task = await admin.from('deal_tasks').insert({
    deal_id: dealId,
    label: 'ヒヤリング',
    kind: 'manual',
    required: true,
    done: false,
    sort: 0,
  }).select('id').single()
  if (task.error) throw task.error

  browser = await launchChromium({ headless: true })
  const context = await browser.newContext({ viewport: { width: 375, height: 667 } })
  const page = await context.newPage()
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.readyState === 'complete')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/app(?:\/|$)/, { timeout: 15_000 })

  const response = await page.request.post(`${base}/api/app/deals/${dealId}/hearing`, {
    data: { text: '旧表記タスクの互換確認' },
  })
  const body = await response.json()
  if (!response.ok() || body.taskUpdated !== true || body.done !== true) {
    throw new Error(`hearing API failed: ${response.status()} ${JSON.stringify(body)}`)
  }
  const { data: updated, error } = await admin.from('deal_tasks').select('label, done, note').eq('id', task.data.id).single()
  if (error || updated.label !== 'ヒヤリング' || updated.done !== true || updated.note !== '旧表記タスクの互換確認') {
    throw error || new Error(`legacy task mismatch: ${JSON.stringify(updated)}`)
  }
  console.log('✓ legacy ヒヤリング task accepted and completed through the browser-authenticated API')
} finally {
  await browser?.close()
  await cleanup()
  const { data: users } = await admin.auth.admin.listUsers()
  const userLeft = users?.users.some(user => user.email === email) ?? false
  const { count: servicesLeft } = await admin.from('services').select('id', { count: 'exact', head: true }).like('name', `${prefix}%`)
  if (userLeft || (servicesLeft ?? 0) !== 0) throw new Error(`throwaway residue: user=${userLeft} services=${servicesLeft}`)
  console.log('✓ UX-5b hearing fixture residue 0')
}
