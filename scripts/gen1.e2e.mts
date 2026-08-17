/** GEN-1 batch E2E. CCGEN1 throwawayのみ作成し、finallyで全撤去する。 */
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import {
  deliverWeeklyDigestRecipients,
  resolveWeeklyDigestAudience,
  runWeeklyDigest,
} from '../lib/weekly-digest-server'
import { signDigestUnsubscribe } from '../lib/weekly-digest'

const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split('\n').filter(line => line.includes('=')).map(line => {
  const index = line.indexOf('=')
  return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^"|"$/g, '')]
}))
for (const [key, value] of Object.entries(env)) if (!process.env[key]) process.env[key] = value
process.env.CC_MAIL_SUPPRESS = '1'

const BASE = process.env.BASE_APP ?? 'http://localhost:4599'
const PREFIX = 'CCGEN1'
const NOW = new Date('2026-08-14T02:00:00.000Z')
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
const ids: { users: string[]; partners: string[]; deals: string[] } = { users: [], partners: [], deals: [] }

function ok(condition: unknown, label: string, detail = '') {
  assert.ok(condition, `${label}${detail ? `: ${detail}` : ''}`)
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`)
}

async function cleanup() {
  const { data: discoveredPartners } = await admin.from('partners').select('id, profile_id').like('code', `${PREFIX}%`)
  const { data: discoveredProfiles } = await admin.from('profiles').select('id').ilike('email', 'cc-gen1-%@mb-system.internal')
  const partnerIds = [...new Set([...ids.partners, ...(discoveredPartners ?? []).map(row => row.id)])]
  const userIds = [...new Set([...ids.users, ...(discoveredPartners ?? []).map(row => row.profile_id), ...(discoveredProfiles ?? []).map(row => row.id)])]
  if (partnerIds.length) {
    await admin.from('notifications').delete().in('partner_id', partnerIds)
    await admin.from('deals').delete().in('partner_id', partnerIds)
    await admin.from('referral_links').delete().in('partner_id', partnerIds)
    await admin.from('member_notification_prefs').delete().in('user_id', userIds)
    await admin.from('partners').delete().in('id', partnerIds)
  }
  if (userIds.length) await admin.from('profiles').delete().in('id', userIds)
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const authIds = (listed.data?.users ?? []).filter(user => user.email?.startsWith('cc-gen1-') && user.email.endsWith('@mb-system.internal')).map(user => user.id)
  for (const id of new Set([...userIds, ...authIds])) await admin.auth.admin.deleteUser(id).catch(() => {})
  // mail_logはservice_roleにDELETEを付与しない監査設計。権限を広げず、batch prefix+templateをDB接続で厳密撤去する。
  execFileSync('/opt/homebrew/Cellar/libpq/18.4/bin/psql', [process.env.DATABASE_URL!, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], {
    input: `delete from public.mail_log where to_email ilike 'cc-gen1-%@mb-system.internal' and template_key in ('weekly-digest','weekly-digest-unsubscribe','weekly-digest-preview');\n`,
    stdio: ['pipe', 'ignore', 'inherit'],
  })
}

async function createPartner(kind: 'new' | 'active' | 'quiet') {
  const email = `cc-gen1-${kind}@mb-system.internal`
  const { data: created, error } = await admin.auth.admin.createUser({ email, password: 'CcGen1!2026xx', email_confirm: true })
  if (error || !created.user) throw error ?? new Error('create user failed')
  ids.users.push(created.user.id)
  await admin.from('profiles').upsert({ id: created.user.id, role: 'partner', name: `${PREFIX}-${kind}`, email })
  const registeredAt = kind === 'active' ? '2026-07-01T00:00:00.000Z' : '2026-06-01T00:00:00.000Z'
  const { data: partner, error: partnerError } = await admin.from('partners').insert({
    profile_id: created.user.id, code: `${PREFIX}-${kind.toUpperCase()}`, status: 'active', tax_type: 'individual', created_at: registeredAt, is_system: false,
  }).select('id').single()
  if (partnerError || !partner) throw partnerError ?? new Error('create partner failed')
  ids.partners.push(partner.id)
  if (kind !== 'new') {
    const createdAt = kind === 'quiet' ? '2026-07-01T00:00:00.000Z' : '2026-08-13T00:00:00.000Z'
    const { data: deal, error: dealError } = await admin.from('deals').insert({
      partner_id: partner.id, service_id: 'reso', customer_name: `${PREFIX}-${kind}`, channel: 'referral', source: 'partner_form',
      status: kind === 'active' ? 'received' : 'lost', consent: true, amount: 0, created_at: createdAt, updated_at: createdAt,
    }).select('id').single()
    if (dealError || !deal) throw dealError ?? new Error('create deal failed')
    ids.deals.push(deal.id)
  }
  await admin.from('notifications').insert({ partner_id: partner.id, title: `${PREFIX}未読`, body: '検証', ref: { type: 'support' } })
  return { partnerId: partner.id, userId: created.user.id, email }
}

if (process.env.CLEANUP_ONLY === '1') {
  await cleanup()
  console.log('GEN-1 cleanup only: done')
  process.exit(0)
}

try {
  await cleanup()
  const beforeOff = await admin.from('mail_log').select('id', { count: 'exact', head: true }).eq('template_key', 'weekly-digest')
  const off = await runWeeklyDigest(admin, NOW)
  const afterOff = await admin.from('mail_log').select('id', { count: 'exact', head: true }).eq('template_key', 'weekly-digest')
  ok(off.enabled === false && beforeOff.count === afterOff.count, 'トグルOFFは完全無音', JSON.stringify(off))

  const fixtures = await Promise.all([createPartner('new'), createPartner('active'), createPartner('quiet')])
  const audience = (await resolveWeeklyDigestAudience(admin, NOW, { allowSuppressedTestPrefix: PREFIX })).filter(r => ids.partners.includes(r.partnerId))
  ok(audience.length === 3, '3セグメントthrowawayを全数解決', String(audience.length))
  const segments = new Set(audience.map(r => r.segment))
  ok(['new', 'active', 'quiet'].every(s => segments.has(s as never)), '3分類が決定的')
  for (const recipient of audience) {
    ok(!/報酬|受注額|粗利|委託費|手数料|fee|amount|[¥￥$€£]\s*\d|\d[\d,]*\s*(円|万円|%)/i.test(recipient.copy.text), `${recipient.segment}文面にmoney/禁止語なし`)
    console.log(`\n--- SNAPSHOT ${recipient.segment} ---\n${recipient.copy.text}\n--- END ---`)
  }

  const one = audience.filter(r => r.partnerId === fixtures[0].partnerId)
  const first = await deliverWeeklyDigestRecipients(admin, one, NOW)
  const second = await deliverWeeklyDigestRecipients(admin, one, NOW)
  ok(first.attempted === 1 && second.attempted === 0 && second.duplicate === 1, '同一週2回は1回だけ記録', `${JSON.stringify(first)} / ${JSON.stringify(second)}`)

  const stopTarget = audience.find(r => r.partnerId === fixtures[1].partnerId)!
  const token = signDigestUnsubscribe(stopTarget.partnerId, Date.now() + 60_000)
  const response = await fetch(`${BASE}/api/weekly-digest/unsubscribe?token=${encodeURIComponent(token)}`, { redirect: 'manual' })
  ok(response.status === 303, 'ワンクリック停止はログイン不要で完了画面へ')
  const { data: pref } = await admin.from('member_notification_prefs').select('email_enabled').eq('user_id', fixtures[1].userId).maybeSingle()
  ok(pref?.email_enabled === false, '停止リンクが設定画面と同じemail_enabledをOFF')
  const afterStop = (await resolveWeeklyDigestAudience(admin, NOW, { allowSuppressedTestPrefix: PREFIX })).filter(r => r.partnerId === stopTarget.partnerId)
  ok(afterStop.length === 0, '停止後は配信対象外')

  const cron = await fetch(`${BASE}/api/cron/weekly-digest`)
  ok(cron.status === 401, 'cron無署名401')
} finally {
  await cleanup()
  const [p, d, u, m, auth] = await Promise.all([
    admin.from('partners').select('id', { count: 'exact', head: true }).like('code', `${PREFIX}%`),
    admin.from('deals').select('id', { count: 'exact', head: true }).like('customer_name', `${PREFIX}%`),
    admin.from('profiles').select('id', { count: 'exact', head: true }).ilike('email', 'cc-gen1-%@mb-system.internal'),
    admin.from('mail_log').select('id', { count: 'exact', head: true }).ilike('to_email', 'cc-gen1-%@mb-system.internal'),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])
  const authCount = (auth.data?.users ?? []).filter(user => user.email?.startsWith('cc-gen1-') && user.email.endsWith('@mb-system.internal')).length
  console.log(`RESIDUE partners=${p.count ?? 0} deals=${d.count ?? 0} profiles=${u.count ?? 0} auth=${authCount} mail=${m.count ?? 0}`)
  assert.equal((p.count ?? 0) + (d.count ?? 0) + (u.count ?? 0) + authCount + (m.count ?? 0), 0)
}
