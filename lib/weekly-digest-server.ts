/** GEN-1 server orchestration. Read-only audience resolution + best-effort email delivery. */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendEmail } from '@/lib/notify'
import { logMail } from '@/lib/mail-send'
import { DEAL_STATUS } from '@/lib/status'
import {
  HEARTBEAT_CATALOG_START,
  WEEKLY_DIGEST_TEMPLATE_KEY,
  buildDigestCopy,
  classifyDigestSegment,
  digestWeekKey,
  isDigestExcludedIdentity,
  selectDigestTip,
  signDigestUnsubscribe,
  type DigestCopy,
  type DigestSegment,
  type DigestTip,
} from '@/lib/weekly-digest'

const DAY = 24 * 60 * 60 * 1000
const BASE = 'https://mb-partners.app'
const ACTIVE_DEAL_STATUSES = new Set(['received', 'in_progress'])

type PartnerRow = {
  id: string
  profile_id: string
  code: string | null
  created_at: string
  profiles: { name: string | null; email: string | null } | { name: string | null; email: string | null }[] | null
}

type DealRow = { partner_id: string; status: string; created_at: string; updated_at: string }
type PrefRow = { user_id: string; email_to: string | null; email_enabled: boolean }
type ReferralLinkRow = { partner_id: string; service_id: string; token: string }

export type DigestRecipient = {
  partnerId: string
  profileId: string
  email: string
  segment: DigestSegment
  weekKey: string
  copy: DigestCopy
}

function singleProfile(value: PartnerRow['profiles']) {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

async function loadTips(admin: SupabaseClient): Promise<DigestTip[]> {
  const { data: menus, error } = await admin
    .from('menus')
    .select('id, service_menu_id, name, short_description, created_at')
    .eq('active', true)
    .gte('created_at', HEARTBEAT_CATALOG_START)
    .order('created_at', { ascending: false })
    .order('id')
  if (error) throw new Error(`weekly digest menus: ${error.message}`)
  const serviceMenuIds = [...new Set((menus ?? []).map(m => m.service_menu_id).filter(Boolean))]
  const { data: serviceMenus, error: smError } = serviceMenuIds.length
    ? await admin.from('service_menus').select('id, service_id').in('id', serviceMenuIds)
    : { data: [], error: null }
  if (smError) throw new Error(`weekly digest service menus: ${smError.message}`)
  const serviceIds = [...new Set((serviceMenus ?? []).map(sm => sm.service_id).filter(Boolean))]
  const { data: services, error: serviceError } = serviceIds.length
    ? await admin.from('services').select('id').in('id', serviceIds).eq('active', true)
    : { data: [], error: null }
  if (serviceError) throw new Error(`weekly digest services: ${serviceError.message}`)
  const activeServices = new Set((services ?? []).map(s => s.id))
  const serviceByMenu = new Map((serviceMenus ?? []).map(sm => [sm.id, sm.service_id]))
  return (menus ?? []).flatMap(menu => {
    const serviceId = serviceByMenu.get(menu.service_menu_id)
    if (!serviceId || !activeServices.has(serviceId)) return []
    return [{ id: menu.id, serviceId, name: menu.name, shortDescription: menu.short_description, publishedAt: menu.created_at }]
  })
}

export async function resolveWeeklyDigestAudience(admin: SupabaseClient, now = new Date(), options?: { allowSuppressedTestPrefix?: string }): Promise<DigestRecipient[]> {
  const { data: rawPartners, error: partnerError } = await admin
    .from('partners')
    .select('id, profile_id, code, created_at, profiles(name, email)')
    .eq('status', 'active')
    .eq('is_system', false)
  if (partnerError) throw new Error(`weekly digest partners: ${partnerError.message}`)
  const partners = (rawPartners ?? []) as unknown as PartnerRow[]
  if (partners.length === 0) return []
  const partnerIds = partners.map(p => p.id)
  const profileIds = partners.map(p => p.profile_id)

  const [{ data: prefs, error: prefsError }, { data: deals, error: dealError }, { data: unread, error: unreadError }, { data: links, error: linkError }, tips] = await Promise.all([
    admin.from('member_notification_prefs').select('user_id, email_to, email_enabled').in('user_id', profileIds),
    admin.from('deals').select('partner_id, status, created_at, updated_at').in('partner_id', partnerIds),
    admin.from('notifications').select('partner_id').in('partner_id', partnerIds).is('read_at', null),
    admin.from('referral_links').select('partner_id, service_id, token').in('partner_id', partnerIds),
    loadTips(admin),
  ])
  if (prefsError || dealError || unreadError || linkError) {
    throw new Error(`weekly digest audience query failed: ${prefsError?.message ?? dealError?.message ?? unreadError?.message ?? linkError?.message}`)
  }
  if (tips.length === 0) throw new Error('weekly digest has no catalog tips')

  const prefByUser = new Map((prefs ?? [] as PrefRow[]).map(p => [p.user_id, p]))
  const dealsByPartner = new Map<string, DealRow[]>()
  for (const deal of (deals ?? []) as DealRow[]) {
    const rows = dealsByPartner.get(deal.partner_id) ?? []
    rows.push(deal)
    dealsByPartner.set(deal.partner_id, rows)
  }
  const unreadByPartner = new Map<string, number>()
  for (const row of unread ?? []) unreadByPartner.set(row.partner_id, (unreadByPartner.get(row.partner_id) ?? 0) + 1)
  const linkByPartnerService = new Map<string, ReferralLinkRow>()
  for (const link of (links ?? []) as ReferralLinkRow[]) linkByPartnerService.set(`${link.partner_id}:${link.service_id}`, link)

  const weekKey = digestWeekKey(now)
  const recipients: DigestRecipient[] = []
  for (const partner of partners) {
    const profile = singleProfile(partner.profiles)
    const pref = prefByUser.get(partner.profile_id)
    if (pref?.email_enabled === false) continue
    const email = (pref?.email_to?.trim() || profile?.email?.trim() || '').toLowerCase()
    const suppressedTestIdentity = process.env.CC_MAIL_SUPPRESS === '1'
      && !!options?.allowSuppressedTestPrefix
      && partner.code?.startsWith(options.allowSuppressedTestPrefix)
      && email.endsWith('@mb-system.internal')
    if (!email || !email.includes('@') || (!suppressedTestIdentity && isDigestExcludedIdentity(email, partner.code, profile?.name))) continue
    if (now.getTime() - new Date(partner.created_at).getTime() < 3 * DAY) continue

    const partnerDeals = (dealsByPartner.get(partner.id) ?? []).sort((a, b) => new Date(b.updated_at ?? b.created_at).getTime() - new Date(a.updated_at ?? a.created_at).getTime())
    const progressCount = partnerDeals.filter(d => ACTIVE_DEAL_STATUSES.has(d.status)).length
    const lastDeal = partnerDeals[0] ?? null
    const segment = classifyDigestSegment({
      registeredAt: partner.created_at,
      totalDeals: partnerDeals.length,
      progressCount,
      lastDealAt: lastDeal?.created_at ?? null,
    }, now)
    if (!segment) continue

    const tip = selectDigestTip(partner.id, now, tips)
    const referral = linkByPartnerService.get(`${partner.id}:${tip.serviceId}`)
    const tipUrl = referral ? `${BASE}/r/${encodeURIComponent(referral.token)}?src=digest` : `${BASE}/app/refer?src=digest`
    const unsubscribeToken = signDigestUnsubscribe(partner.id, now.getTime() + 180 * DAY)
    const copy = buildDigestCopy({
      segment,
      displayName: profile?.name?.trim() || 'パートナー',
      progressCount,
      recentState: lastDeal ? (DEAL_STATUS[lastDeal.status]?.label ?? lastDeal.status) : null,
      unreadCount: unreadByPartner.get(partner.id) ?? 0,
      tip,
      tipUrl,
      referUrl: `${BASE}/app/refer?src=digest`,
      consultUrl: `${BASE}/app/refer?consult=1&src=digest`,
      unsubscribeUrl: `${BASE}/api/weekly-digest/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
    })
    recipients.push({ partnerId: partner.id, profileId: partner.profile_id, email, segment, weekKey, copy })
  }
  return recipients
}

export async function weeklyDigestEnabled(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin.from('notification_settings').select('weekly_digest_enabled').eq('id', 1).maybeSingle()
  if (error) return false
  return data?.weekly_digest_enabled === true
}

export async function runWeeklyDigest(admin: SupabaseClient, now = new Date()) {
  if (!(await weeklyDigestEnabled(admin))) return { enabled: false, scanned: 0, attempted: 0, sent: 0, duplicate: 0 }
  const recipients = await resolveWeeklyDigestAudience(admin, now)
  return { enabled: true, ...(await deliverWeeklyDigestRecipients(admin, recipients, now)) }
}

/** resolved recipientsだけを送る。batch E2Eはthrowaway 1名に限定して冪等性を実走できる。 */
export async function deliverWeeklyDigestRecipients(admin: SupabaseClient, recipients: DigestRecipient[], now = new Date()) {
  const weekKey = digestWeekKey(now)
  const { data: existing, error: existingError } = await admin
    .from('mail_log')
    .select('status, meta')
    .eq('template_key', WEEKLY_DIGEST_TEMPLATE_KEY)
    .contains('meta', { week_key: weekKey, event_type: 'delivery' })
  if (existingError) throw new Error(`weekly digest idempotency: ${existingError.message}`)
  const delivered = new Set((existing ?? []).flatMap(row => {
    const meta = row.meta as { partner_id?: string } | null
    return row.status !== 'error' && meta?.partner_id ? [meta.partner_id] : []
  }))

  let attempted = 0
  let sent = 0
  let duplicate = 0
  for (const recipient of recipients) {
    if (delivered.has(recipient.partnerId)) { duplicate++; continue }
    attempted++
    const result = await sendEmail({ to: recipient.email, subject: recipient.copy.subject, text: recipient.copy.text, html: recipient.copy.html })
    if (result.sent) sent++
    await logMail({
      template_key: WEEKLY_DIGEST_TEMPLATE_KEY,
      event: '週次ダイジェスト',
      to_email: recipient.email,
      to_role: 'partner',
      subject: recipient.copy.subject,
      status: result.sent ? 'sent' : result.error ? 'error' : 'skipped',
      detail: result.error ?? result.skipped ?? null,
      meta: { partner_id: recipient.partnerId, week_key: weekKey, segment: recipient.segment, tip_id: recipient.copy.tip.id, event_type: 'delivery' },
    })
  }
  return { scanned: recipients.length, attempted, sent, duplicate }
}

export function sampleDigestCopies(tips: DigestTip[], now = new Date()) {
  if (tips.length === 0) return []
  return (['new', 'active', 'quiet'] as const).map((segment, index) => {
    const tip = selectDigestTip(`preview-${segment}`, now, tips)
    return buildDigestCopy({
      segment,
      displayName: '山田 太郎',
      progressCount: segment === 'active' ? 2 : 0,
      recentState: segment === 'active' ? '対応中' : null,
      unreadCount: index,
      tip,
      tipUrl: `${BASE}/r/preview?src=digest`,
      referUrl: `${BASE}/app/refer?src=digest`,
      consultUrl: `${BASE}/app/refer?consult=1&src=digest`,
      unsubscribeUrl: `${BASE}/api/weekly-digest/unsubscribe?token=preview`,
    })
  })
}

export async function loadDigestTipsForPreview(admin: SupabaseClient) {
  return loadTips(admin)
}
