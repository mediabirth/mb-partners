/**
 * GEN-3「火」: 匿名のネットワーク集計。
 *
 * 公開文面へ渡せる値を3件数と期間だけに固定し、名前・社名・メニュー名・money値の
 * 入力経路を型で持たない。DB読取もid・状態・時刻・除外判定用の識別子だけに限定する。
 */
import { unstable_cache } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/server'

export type SocialProofPeriod = 7 | 30
export type SocialProofCounts = Readonly<{
  referrals: number
  wins: number
  newPartners: number
}>

export type SocialProofCopy = Readonly<{
  lines: readonly string[]
  digestLine: string | null
}>

type ProfileIdentity = { email: string | null; name: string | null }
type PartnerIdentity = {
  id: string
  status: string
  is_system: boolean | null
  code: string | null
  created_at: string
  profiles: ProfileIdentity | ProfileIdentity[] | null
}
type DealRow = { id: string; partner_id: string; created_at: string }
type WinRow = {
  deal_id: string
  created_at: string
  deals: { partner_id: string } | { partner_id: string }[] | null
}

const JST_OFFSET = 9 * 60 * 60 * 1000
export const WON_EVENT_BODY = 'ステータスを「成約確定」に変更しました'

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

/** JSTの当日を含む直近N暦日の開始（00:00 JST）。 */
export function socialProofWindowStart(now: Date, periodDays: SocialProofPeriod): string {
  const jst = new Date(now.getTime() + JST_OFFSET)
  const startUtc = Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate() - (periodDays - 1)) - JST_OFFSET
  return new Date(startUtc).toISOString()
}

/** UI/メール文面の唯一の生成口。入力は3件数と期間だけ。 */
export function buildSocialProofCopy(counts: SocialProofCounts, periodDays: SocialProofPeriod): SocialProofCopy {
  const referrals = nonNegativeInteger(counts.referrals)
  const wins = nonNegativeInteger(counts.wins)
  const newPartners = nonNegativeInteger(counts.newPartners)
  const lines = [
    referrals > 0 ? `この${periodDays}日で、新しい紹介が ${referrals}件 動きました` : null,
    wins > 0 ? `${wins}件が成約になりました` : null,
    newPartners > 0 ? `新しい仲間が ${newPartners}人 加わりました` : null,
  ].filter((line): line is string => line !== null)
  const digestParts = [
    referrals > 0 ? `新しい紹介が${referrals}件` : null,
    wins > 0 ? `成約が${wins}件` : null,
  ].filter((part): part is string => part !== null)
  return {
    lines,
    digestLine: digestParts.length > 0 ? `先週、ネットワークでは ${digestParts.join('・')} ありました` : null,
  }
}

function singleProfile(value: PartnerIdentity['profiles']): ProfileIdentity | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export function isSocialProofExcludedIdentity(identity: {
  isSystem: boolean | null
  email: string | null
  code: string | null
  name: string | null
}): boolean {
  if (identity.isSystem) return true
  const email = identity.email?.trim().toLowerCase() ?? ''
  const haystack = `${email} ${(identity.code ?? '').toLowerCase()} ${(identity.name ?? '').toLowerCase()}`
  return email.endsWith('@mb-system.internal') || haystack.includes('cc-monitor')
}

function isExcludedPartner(partner: PartnerIdentity): boolean {
  const profile = singleProfile(partner.profiles)
  return isSocialProofExcludedIdentity({
    isSystem: partner.is_system,
    email: profile?.email ?? null,
    code: partner.code,
    name: profile?.name ?? null,
  })
}

function winPartnerId(value: WinRow['deals']): string | null {
  const deal = Array.isArray(value) ? (value[0] ?? null) : value
  return deal?.partner_id ?? null
}

/** 読み取り専用の集計本体。テストではservice-role互換clientを注入できる。 */
export async function loadSocialProof(
  admin: SupabaseClient,
  periodDays: SocialProofPeriod,
  now = new Date(),
): Promise<SocialProofCounts> {
  const since = socialProofWindowStart(now, periodDays)
  const { data: partnerData, error: partnerError } = await admin
    .from('partners')
    .select('id, status, is_system, code, created_at, profiles(email, name)')
  if (partnerError) throw new Error(`social proof partners: ${partnerError.message}`)

  const partners = (partnerData ?? []) as unknown as PartnerIdentity[]
  const eligible = new Set(partners.filter(partner => !isExcludedPartner(partner)).map(partner => partner.id))
  if (eligible.size === 0) return { referrals: 0, wins: 0, newPartners: 0 }

  const [dealResult, winResult] = await Promise.all([
    admin.from('deals').select('id, partner_id, created_at').gte('created_at', since),
    admin.from('deal_events')
      .select('deal_id, created_at, deals!inner(partner_id)')
      .eq('body', WON_EVENT_BODY)
      .gte('created_at', since),
  ])
  if (dealResult.error || winResult.error) {
    throw new Error(`social proof aggregate: ${dealResult.error?.message ?? winResult.error?.message}`)
  }

  const referrals = ((dealResult.data ?? []) as DealRow[]).filter(deal => eligible.has(deal.partner_id)).length
  const wins = ((winResult.data ?? []) as unknown as WinRow[]).filter(event => {
    const partnerId = winPartnerId(event.deals)
    return partnerId !== null && eligible.has(partnerId)
  }).length
  const newPartners = partners.filter(partner =>
    eligible.has(partner.id)
    && partner.status === 'active'
    && new Date(partner.created_at).getTime() >= new Date(since).getTime()
  ).length

  return { referrals, wins, newPartners }
}

const getCachedSocialProof = unstable_cache(
  async (periodDays: SocialProofPeriod) => loadSocialProof(await createServiceRoleClient(), periodDays),
  ['gen3-social-proof-v1'],
  { revalidate: 600 },
)

export async function getSocialProof(periodDays: SocialProofPeriod): Promise<SocialProofCounts> {
  return getCachedSocialProof(periodDays)
}
