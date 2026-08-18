/** GEN-3 throwaway E2E。CCGEN3行だけを書き、finallyでFK子→authまで全撤去する。 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildSocialProofCopy, loadSocialProof, socialProofWindowStart, type SocialProofCounts, type SocialProofPeriod } from '../lib/social-proof'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, '')]
}))
for (const [key, value] of Object.entries(env)) if (!process.env[key]) process.env[key] = value
process.env.CC_MAIL_SUPPRESS = '1'

const PREFIX = 'CCGEN3'
const NOW = new Date('2026-08-18T03:00:00.000Z')
const WON_EVENT = 'ステータスを「成約確定」に変更しました'
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const ids = { users: [] as string[], partners: [] as string[], deals: [] as string[] }

function ok(value: unknown, label: string, detail = '') {
  assert.ok(value, `${label}${detail ? `: ${detail}` : ''}`)
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`)
}

function same(actual: unknown, expected: unknown, label: string) {
  assert.deepEqual(actual, expected, label)
  console.log(`✓ ${label} — ${JSON.stringify(actual)}`)
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

async function directCounts(periodDays: SocialProofPeriod): Promise<SocialProofCounts> {
  const since = socialProofWindowStart(NOW, periodDays)
  const { data: rawPartners, error: partnerError } = await admin.from('partners').select('id, status, is_system, code, created_at, profiles(email, name)')
  if (partnerError) throw partnerError
  const partners = (rawPartners ?? []) as unknown as Array<{ id: string; status: string; is_system: boolean; code: string | null; created_at: string; profiles: { email: string | null; name: string | null } | Array<{ email: string | null; name: string | null }> | null }>
  const eligible = new Set(partners.filter(partner => {
    const profile = one(partner.profiles)
    const email = profile?.email?.trim().toLowerCase() ?? ''
    const identity = `${email} ${(partner.code ?? '').toLowerCase()} ${(profile?.name ?? '').toLowerCase()}`
    return !partner.is_system && !email.endsWith('@mb-system.internal') && !identity.includes('cc-monitor')
  }).map(partner => partner.id))
  const [{ data: deals, error: dealError }, { data: events, error: eventError }] = await Promise.all([
    admin.from('deals').select('partner_id').gte('created_at', since),
    admin.from('deal_events').select('deals!inner(partner_id)').eq('body', WON_EVENT).gte('created_at', since),
  ])
  if (dealError || eventError) throw dealError ?? eventError
  return {
    referrals: (deals ?? []).filter(row => eligible.has(row.partner_id)).length,
    wins: (events ?? []).filter(row => {
      const deal = one(row.deals as unknown as { partner_id: string } | { partner_id: string }[] | null)
      return !!deal && eligible.has(deal.partner_id)
    }).length,
    newPartners: partners.filter(row => eligible.has(row.id) && row.status === 'active' && new Date(row.created_at) >= new Date(since)).length,
  }
}

async function cleanup() {
  const { data: discoveredPartners } = await admin.from('partners').select('id, profile_id').like('code', `${PREFIX}%`)
  const { data: discoveredProfiles } = await admin.from('profiles').select('id').ilike('email', 'cc-gen3-%@example.invalid')
  const partnerIds = [...new Set([...ids.partners, ...(discoveredPartners ?? []).map(row => row.id)])]
  const userIds = [...new Set([...ids.users, ...(discoveredPartners ?? []).map(row => row.profile_id), ...(discoveredProfiles ?? []).map(row => row.id)])]
  const { data: discoveredDeals } = partnerIds.length ? await admin.from('deals').select('id').in('partner_id', partnerIds) : { data: [] }
  const dealIds = [...new Set([...ids.deals, ...(discoveredDeals ?? []).map(row => row.id)])]
  if (dealIds.length) {
    await admin.from('deal_events').delete().in('deal_id', dealIds)
    await admin.from('deal_items').delete().in('deal_id', dealIds)
    await admin.from('deals').delete().in('id', dealIds)
  }
  if (partnerIds.length) await admin.from('partners').delete().in('id', partnerIds)
  if (userIds.length) await admin.from('profiles').delete().in('id', userIds)
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authIds = (listed.data?.users ?? []).filter(user => user.email?.startsWith('cc-gen3-') && user.email.endsWith('@example.invalid')).map(user => user.id)
  for (const id of new Set([...userIds, ...authIds])) await admin.auth.admin.deleteUser(id).catch(() => {})
}

async function createFixture() {
  const marker = randomUUID().slice(0, 8)
  const email = `cc-gen3-${marker}@example.invalid`
  const { data: created, error: authError } = await admin.auth.admin.createUser({ email, password: 'CcGen3!2026xx', email_confirm: true })
  if (authError || !created.user) throw authError ?? new Error('GEN-3 auth fixture failed')
  ids.users.push(created.user.id)
  await admin.from('profiles').upsert({ id: created.user.id, role: 'partner', name: `${PREFIX}-${marker}`, email })
  const { data: partner, error: partnerError } = await admin.from('partners').insert({
    profile_id: created.user.id,
    code: `${PREFIX}-${marker}`,
    status: 'active',
    is_system: false,
    tax_type: 'individual',
    created_at: '2026-08-17T03:00:00.000Z',
  }).select('id').single()
  if (partnerError || !partner) throw partnerError ?? new Error('GEN-3 partner fixture failed')
  ids.partners.push(partner.id)
  const { data: deals, error: dealError } = await admin.from('deals').insert([
    { partner_id: partner.id, service_id: 'reso', customer_name: `${PREFIX}-7D`, channel: 'referral', source: 'partner_form', status: 'confirmed', consent: true, amount: 0, created_at: '2026-08-17T04:00:00.000Z', updated_at: '2026-08-17T04:00:00.000Z' },
    { partner_id: partner.id, service_id: 'reso', customer_name: `${PREFIX}-30D`, channel: 'referral', source: 'partner_form', status: 'received', consent: true, amount: 0, created_at: '2026-08-08T04:00:00.000Z', updated_at: '2026-08-08T04:00:00.000Z' },
  ]).select('id, customer_name')
  if (dealError || !deals || deals.length !== 2) throw dealError ?? new Error('GEN-3 deal fixtures failed')
  ids.deals.push(...deals.map(row => row.id))
  const wonDeal = deals.find(row => row.customer_name.endsWith('7D'))!
  const { error: eventError } = await admin.from('deal_events').insert({ deal_id: wonDeal.id, body: WON_EVENT, visible_to_partner: true, created_at: '2026-08-17T05:00:00.000Z' })
  if (eventError) throw eventError
}

await cleanup()
const before30 = await loadSocialProof(admin, 30, NOW)
const before7 = await loadSocialProof(admin, 7, NOW)
try {
  await createFixture()
  const after30 = await loadSocialProof(admin, 30, NOW)
  const after7 = await loadSocialProof(admin, 7, NOW)
  same(after30, { referrals: before30.referrals + 2, wins: before30.wins + 1, newPartners: before30.newPartners + 1 }, '30日窓はDB実測差分どおり')
  same(after7, { referrals: before7.referrals + 1, wins: before7.wins + 1, newPartners: before7.newPartners + 1 }, '7日窓はDB実測差分どおり')
  same(after30, await directCounts(30), '表示集計=独立直接集計（30日・全桁一致）')
  same(after7, await directCounts(7), '表示集計=独立直接集計（7日・全桁一致）')
  ok(buildSocialProofCopy(after30, 30).lines.length > 0, '実件数でカード文面が出現')
  ok(buildSocialProofCopy({ referrals: 0, wins: 0, newPartners: 0 }, 30).lines.length === 0, '全0でカード文面なし')
} finally {
  await cleanup()
  same(await loadSocialProof(admin, 30, NOW), before30, '撤去後30日集計を原状復帰')
  same(await loadSocialProof(admin, 7, NOW), before7, '撤去後7日集計を原状復帰')
  const [partners, deals, profiles, auth] = await Promise.all([
    admin.from('partners').select('id', { count: 'exact', head: true }).like('code', `${PREFIX}%`),
    admin.from('deals').select('id', { count: 'exact', head: true }).like('customer_name', `${PREFIX}%`),
    admin.from('profiles').select('id', { count: 'exact', head: true }).ilike('email', 'cc-gen3-%@example.invalid'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])
  const authCount = (auth.data?.users ?? []).filter(user => user.email?.startsWith('cc-gen3-') && user.email.endsWith('@example.invalid')).length
  console.log(`RESIDUE partners=${partners.count ?? 0} deals=${deals.count ?? 0} profiles=${profiles.count ?? 0} auth=${authCount}`)
  assert.equal((partners.count ?? 0) + (deals.count ?? 0) + (profiles.count ?? 0) + authCount, 0)
}
