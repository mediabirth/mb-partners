import { isSocialProofExcludedIdentity, WON_EVENT_BODY } from './social-proof'
import type { FunnelSource } from './funnel-attribution'

export { WON_EVENT_BODY }

const DAY_MS = 86_400_000
const WEEK_MS = 7 * DAY_MS
const JST_MS = 9 * 60 * 60 * 1000

export type NorthStarPartner = Readonly<{
  id: string
  code: string | null
  name: string | null
  email: string | null
  isSystem: boolean | null
}>
export type NorthStarDeal = Readonly<{ partnerId: string; createdAt: string; src: FunnelSource | null }>
export type NorthStarFunnelEvent = Readonly<{ eventType: string; partnerId: string | null; src: FunnelSource | null; createdAt: string }>
export type NorthStarMail = Readonly<{ templateKey: string | null; status: string; createdAt: string }>
export type NorthStarWin = Readonly<{ partnerId: string | null; createdAt: string }>

export type PartnerStage = 'none' | 'once' | 'repeat'
export type PartnerStageRow = Readonly<{
  id: string
  code: string
  name: string
  referrals: number
  lastReferralAt: string | null
  stage: PartnerStage
}>
export type NorthStarWeek = Readonly<{
  key: string
  label: string
  start: string
  end: string
  digestSent: number
  digestViews: number
  cardViews: number
  shares: number
  referrals: number
  attributedReferrals: number
  wins: number
}>
export type NorthStarSnapshot = Readonly<{
  repeaters: number
  referrers: number
  secondReferralRate: number | null
  medianDaysToSecond: number | null
  stoppedAfterOne: number
  stages: Readonly<Record<PartnerStage, readonly PartnerStageRow[]>>
  weeks: readonly NorthStarWeek[]
}>

function validMs(value: string): number | null {
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : null
}

/** 指定時刻を含むJST週（月曜00:00）のUTC時刻。 */
export function jstMondayStart(now: Date): Date {
  const local = new Date(now.getTime() + JST_MS)
  const daysFromMonday = (local.getUTCDay() + 6) % 7
  const localMonday = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - daysFromMonday)
  return new Date(localMonday - JST_MS)
}

function jstDateLabel(utcMs: number): string {
  const local = new Date(utcMs + JST_MS)
  return `${local.getUTCMonth() + 1}/${local.getUTCDate()}`
}

function weekKey(utcMs: number): string {
  const local = new Date(utcMs + JST_MS)
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}`
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function stageFor(count: number): PartnerStage {
  return count === 0 ? 'none' : count === 1 ? 'once' : 'repeat'
}

export function buildNorthStarSnapshot(input: {
  partners: readonly NorthStarPartner[]
  deals: readonly NorthStarDeal[]
  funnelEvents: readonly NorthStarFunnelEvent[]
  mails: readonly NorthStarMail[]
  wins: readonly NorthStarWin[]
  now: Date
}): NorthStarSnapshot {
  const eligiblePartners = input.partners.filter(partner => !isSocialProofExcludedIdentity({
    isSystem: partner.isSystem,
    email: partner.email,
    code: partner.code,
    name: partner.name,
  }))
  const eligibleIds = new Set(eligiblePartners.map(partner => partner.id))
  const dealsByPartner = new Map<string, NorthStarDeal[]>()
  for (const deal of input.deals) {
    if (!eligibleIds.has(deal.partnerId)) continue
    const current = dealsByPartner.get(deal.partnerId) ?? []
    current.push(deal)
    dealsByPartner.set(deal.partnerId, current)
  }
  for (const deals of dealsByPartner.values()) {
    deals.sort((a, b) => (validMs(a.createdAt) ?? 0) - (validMs(b.createdAt) ?? 0))
  }

  const stageRows = eligiblePartners.map(partner => {
    const deals = dealsByPartner.get(partner.id) ?? []
    return {
      id: partner.id,
      code: partner.code ?? '—',
      name: partner.name ?? '—',
      referrals: deals.length,
      lastReferralAt: deals.at(-1)?.createdAt ?? null,
      stage: stageFor(deals.length),
    } satisfies PartnerStageRow
  }).sort((a, b) => b.referrals - a.referrals
    || (validMs(b.lastReferralAt ?? '') ?? -1) - (validMs(a.lastReferralAt ?? '') ?? -1)
    || a.code.localeCompare(b.code, 'ja'))

  const stages: Record<PartnerStage, PartnerStageRow[]> = { none: [], once: [], repeat: [] }
  for (const row of stageRows) stages[row.stage].push(row)
  const referrers = stages.once.length + stages.repeat.length
  const repeaters = stages.repeat.length
  const intervals = stages.repeat.map(row => {
    const deals = dealsByPartner.get(row.id)!
    return ((validMs(deals[1].createdAt) ?? 0) - (validMs(deals[0].createdAt) ?? 0)) / DAY_MS
  })

  const currentWeekStart = jstMondayStart(input.now).getTime()
  const firstWeekStart = currentWeekStart - 7 * WEEK_MS
  const weeks: NorthStarWeek[] = Array.from({ length: 8 }, (_, index) => {
    const startMs = firstWeekStart + index * WEEK_MS
    const endMs = startMs + WEEK_MS
    return {
      key: weekKey(startMs),
      label: `${jstDateLabel(startMs)}〜${jstDateLabel(endMs - DAY_MS)}`,
      start: new Date(startMs).toISOString(),
      end: new Date(endMs).toISOString(),
      digestSent: 0,
      digestViews: 0,
      cardViews: 0,
      shares: 0,
      referrals: 0,
      attributedReferrals: 0,
      wins: 0,
    }
  })
  const mutateWeek = (createdAt: string, update: (week: NorthStarWeek) => NorthStarWeek) => {
    const ms = validMs(createdAt)
    if (ms === null) return
    const index = Math.floor((ms - firstWeekStart) / WEEK_MS)
    if (index >= 0 && index < weeks.length) weeks[index] = update(weeks[index])
  }
  for (const mail of input.mails) {
    if (mail.templateKey === 'weekly-digest' && mail.status === 'sent') {
      mutateWeek(mail.createdAt, week => ({ ...week, digestSent: week.digestSent + 1 }))
    }
  }
  for (const event of input.funnelEvents) {
    if (event.partnerId !== null && !eligibleIds.has(event.partnerId)) continue
    mutateWeek(event.createdAt, week => {
      if (event.eventType === 'share') return { ...week, shares: week.shares + 1 }
      if (event.eventType !== 'landing_view') return week
      if (event.src === 'digest') return { ...week, digestViews: week.digestViews + 1 }
      if (event.src === 'card') return { ...week, cardViews: week.cardViews + 1 }
      return week
    })
  }
  for (const deal of input.deals) {
    if (!eligibleIds.has(deal.partnerId)) continue
    mutateWeek(deal.createdAt, week => ({
      ...week,
      referrals: week.referrals + 1,
      attributedReferrals: week.attributedReferrals + (deal.src === 'digest' || deal.src === 'card' ? 1 : 0),
    }))
  }
  for (const win of input.wins) {
    if (!win.partnerId || !eligibleIds.has(win.partnerId)) continue
    mutateWeek(win.createdAt, week => ({ ...week, wins: week.wins + 1 }))
  }

  return {
    repeaters,
    referrers,
    secondReferralRate: referrers === 0 ? null : repeaters / referrers * 100,
    medianDaysToSecond: median(intervals),
    stoppedAfterOne: stages.once.length,
    stages,
    weeks,
  }
}

export function formatSecondReferralRate(snapshot: Pick<NorthStarSnapshot, 'repeaters' | 'referrers' | 'secondReferralRate'>): string {
  if (snapshot.secondReferralRate === null) return '—（まだ最初の紹介がありません）'
  const value = Math.round(snapshot.secondReferralRate * 10) / 10
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}%（n=${snapshot.repeaters}/${snapshot.referrers}）`
}

export function formatMedianDays(days: number | null): string {
  if (days === null) return '—'
  const value = Math.round(days * 10) / 10
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)}日`
}
