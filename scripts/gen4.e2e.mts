/** GEN-4 throwaway E2E。CCGEN4だけを作成し、finallyでFK子→authまで全撤去する。 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildNorthStarSnapshot, formatSecondReferralRate, type NorthStarDeal, type NorthStarPartner } from '../lib/north-star'
import { normalizeFunnelSource } from '../lib/funnel-attribution'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, '')]
}))
for (const [key, value] of Object.entries(env)) if (!process.env[key]) process.env[key] = value
process.env.CC_MAIL_SUPPRESS = '1'

const BASE = process.env.BASE_APP ?? 'http://localhost:3000'
const PREFIX = 'CCGEN4'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const ids = { users: [] as string[], partners: [] as string[], deals: [] as string[], links: [] as string[] }

function same(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label)
  console.log(`✓ ${label} — ${JSON.stringify(actual)}`)
}

async function cleanup() {
  const { data: foundPartners } = await admin.from('partners').select('id, profile_id').like('code', `${PREFIX}%`)
  const partnerIds = [...new Set([...ids.partners, ...(foundPartners ?? []).map(row => row.id)])]
  const userIds = [...new Set([...ids.users, ...(foundPartners ?? []).map(row => row.profile_id)])]
  const { data: foundDeals } = partnerIds.length ? await admin.from('deals').select('id').in('partner_id', partnerIds) : { data: [] }
  const dealIds = [...new Set([...ids.deals, ...(foundDeals ?? []).map(row => row.id)])]
  for (const dealId of dealIds) {
    await admin.from('mail_log').delete().contains('meta', { deal_id: dealId }).then(() => {}, () => {})
    await admin.from('audit_logs').delete().contains('meta', { deal_id: dealId }).then(() => {}, () => {})
  }
  if (dealIds.length) {
    await admin.from('deal_events').delete().in('deal_id', dealIds)
    await admin.from('deal_items').delete().in('deal_id', dealIds)
    await admin.from('funnel_events').delete().in('dedup_hash', dealIds.map(id => `register:${id}`))
    await admin.from('deals').delete().in('id', dealIds)
  }
  if (partnerIds.length) {
    await admin.from('notifications').delete().in('partner_id', partnerIds)
    await admin.from('referral_links').delete().in('partner_id', partnerIds)
    await admin.from('partners').delete().in('id', partnerIds)
  }
  if (userIds.length) await admin.from('profiles').delete().in('id', userIds)
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authIds = (listed.data?.users ?? []).filter(user => user.email?.startsWith('cc-gen4-') && user.email.endsWith('@example.invalid')).map(user => user.id)
  for (const id of new Set([...userIds, ...authIds])) await admin.auth.admin.deleteUser(id).catch(() => {})
}

async function createPartner(label: string, serviceId: string) {
  const marker = randomUUID().slice(0, 8)
  const email = `cc-gen4-${label.toLowerCase()}-${marker}@example.invalid`
  const auth = await admin.auth.admin.createUser({ email, password: 'CcGen4!2026xx', email_confirm: true })
  if (auth.error || !auth.data.user) throw auth.error ?? new Error('auth fixture failed')
  ids.users.push(auth.data.user.id)
  await admin.from('profiles').upsert({ id: auth.data.user.id, role: 'partner', name: `${PREFIX}-${label}`, email })
  const partner = await admin.from('partners').insert({ profile_id: auth.data.user.id, code: `${PREFIX}-${label}-${marker}`, status: 'active', is_system: false, tax_type: 'individual' }).select('id').single()
  if (partner.error || !partner.data) throw partner.error ?? new Error('partner fixture failed')
  ids.partners.push(partner.data.id)
  const token = `${PREFIX.toLowerCase()}-${label.toLowerCase()}-${marker}`
  const link = await admin.from('referral_links').insert({ partner_id: partner.data.id, service_id: serviceId, token }).select('id').single()
  if (link.error || !link.data) throw link.error ?? new Error('link fixture failed')
  ids.links.push(link.data.id)
  return { id: partner.data.id, token, code: `${PREFIX}-${label}-${marker}`, name: `${PREFIX}-${label}`, email }
}

async function submit(token: string, customerName: string, src: unknown) {
  const response = await fetch(`${BASE}/api/referral`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, customerName, contactName: customerName, phone: '09000000000', memo: 'GEN-4検証', via: 'link', src, website: '' }),
  })
  assert.equal(response.status, 200, `${customerName}: referral POST`)
  const row = await admin.from('deals').select('id, partner_id, service_id, menu_id, channel, source, src, status, consent, amount, reward_snapshot, internal_memo, created_by').eq('customer_name', customerName).single()
  if (row.error || !row.data) throw row.error ?? new Error('created deal not found')
  ids.deals.push(row.data.id)
  return row.data
}

await cleanup()
try {
  const service = await admin.from('services').select('id').eq('active', true).limit(1).single()
  if (service.error || !service.data) throw service.error ?? new Error('active service not found')
  const [a, b, c] = await Promise.all(['A', 'B', 'C'].map(label => createPartner(label, service.data.id)))
  const first = await submit(a.token, `${PREFIX}-A1`, 'digest')
  const second = await submit(a.token, `${PREFIX}-A2`, 'not-allowed')
  const only = await submit(b.token, `${PREFIX}-B1`, undefined)
  same(first.src, 'digest', 'POST src=digestをdeals.srcへ記録')
  same(second.src, null, '不正srcはnull')
  same(only.src, null, '旧形srcなしはnull')
  const comparable = (row: typeof first) => ({ ...row, id: undefined, src: undefined })
  same(comparable(first), comparable(second), 'src以外の起票・reward_snapshot構造は全ビット同形式')

  await Promise.all([
    admin.from('deals').update({ created_at: '2026-08-01T00:00:00.000Z' }).eq('id', first.id),
    admin.from('deals').update({ created_at: '2026-08-05T12:00:00.000Z' }).eq('id', second.id),
    admin.from('deals').update({ created_at: '2026-08-03T00:00:00.000Z' }).eq('id', only.id),
  ])
  const dbDeals = await admin.from('deals').select('partner_id, created_at, src').in('id', ids.deals).order('created_at')
  if (dbDeals.error) throw dbDeals.error
  const metricPartners: NorthStarPartner[] = [a, b, c].map(partner => ({ ...partner, isSystem: false }))
  const metricDeals: NorthStarDeal[] = (dbDeals.data ?? []).map(row => ({ partnerId: row.partner_id, createdAt: row.created_at, src: normalizeFunnelSource(row.src) }))
  const snapshot = buildNorthStarSnapshot({ partners: metricPartners, deals: metricDeals, funnelEvents: [], mails: [], wins: [], now: new Date('2026-08-18T02:00:00.000Z') })
  same(formatSecondReferralRate(snapshot), '50%（n=1/2）', 'A=2/B=1/C=0の2回目紹介率')
  same(Object.fromEntries(Object.entries(snapshot.stages).map(([key, rows]) => [key, rows.length])), { none: 1, once: 1, repeat: 1 }, 'ステージ人数は1/1/1')
  same(snapshot.medianDaysToSecond, 4.5, '中央値はDB created_at実差分')
} finally {
  await cleanup()
  const [partners, deals, profiles, links] = await Promise.all([
    admin.from('partners').select('id', { count: 'exact', head: true }).like('code', `${PREFIX}%`),
    admin.from('deals').select('id', { count: 'exact', head: true }).like('customer_name', `${PREFIX}%`),
    admin.from('profiles').select('id', { count: 'exact', head: true }).ilike('email', 'cc-gen4-%@example.invalid'),
    admin.from('referral_links').select('id', { count: 'exact', head: true }).like('token', `${PREFIX.toLowerCase()}-%`),
  ])
  const residue = (partners.count ?? 0) + (deals.count ?? 0) + (profiles.count ?? 0) + (links.count ?? 0)
  console.log(`RESIDUE partners=${partners.count ?? 0} deals=${deals.count ?? 0} profiles=${profiles.count ?? 0} links=${links.count ?? 0}`)
  assert.equal(residue, 0)
}
