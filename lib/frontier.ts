// R2 フロンティア（統括パートナー）オーバーライド = "1種類の報酬" としてアプリ層で加算。
// 既存 payout_items snapshot / close_month_batch は不変。源泉・端数は lib/payout を流用。
import { withholdingTax } from '@/lib/payout'

export const OVERRIDE_RATE = 0.10        // パートナー報酬 × 10%
export const LINK_WINDOW_MONTHS = 12     // 紐づけから12ヶ月以内のみ

type DealLike = {
  partner_id: string | null
  amount: number
  status: string
  fixed_month?: string | null
  created_at: string
}
type PartnerLink = { frontier_id: string | null; frontier_linked_at: string | null }

/** deal の帰属月（fixed_month 優先、なければ created_at）。YYYY-MM */
export function dealMonth(d: DealLike): string {
  return (d.fixed_month ?? d.created_at).slice(0, 7)
}

/** linkedAt から12ヶ月以内に dealDate があるか（linkedAt <= dealDate <= linkedAt+12M）。 */
export function withinWindow(linkedAt: string, dealRef: string): boolean {
  const l = new Date(linkedAt)
  const d = new Date(dealRef)
  if (Number.isNaN(l.getTime()) || Number.isNaN(d.getTime())) return false
  const end = new Date(l.getTime()); end.setMonth(end.getMonth() + LINK_WINDOW_MONTHS)
  return d.getTime() >= l.getTime() && d.getTime() <= end.getTime()
}

/**
 * 指定月のフロンティア別 override 合計（gross）を算出。
 * 1段のみ: 各 deal は「その案件を成約したパートナー本人」の“直接の”フロンティア1人にのみ加算。
 * （override を deal として扱わない＝再帰しない。配下の配下へは波及しない。）
 * 未稼働/期限切れ/該当なしは計上0。
 * @returns Map<frontierId, overrideGross>
 */
export function computeOverrides(
  deals: DealLike[],
  partnerById: Record<string, PartnerLink>,
  ym: string,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const d of deals) {
    if (d.status !== 'confirmed' && d.status !== 'paid') continue
    if (dealMonth(d) !== ym) continue
    if (!d.partner_id) continue
    const link = partnerById[d.partner_id]
    if (!link?.frontier_id || !link.frontier_linked_at) continue
    if (d.partner_id === link.frontier_id) continue // 自己紐づけは無視
    const ref = d.fixed_month ?? d.created_at
    if (!withinWindow(link.frontier_linked_at, ref)) continue
    out[link.frontier_id] = (out[link.frontier_id] ?? 0) + Math.round(d.amount * OVERRIDE_RATE)
  }
  return out
}

/**
 * フロンティアの合算明細 = 自分の報酬(own gross) ＋ override。
 * 源泉・端数は既存ルール（合算 gross に対して再計算）。
 */
export function combinedPayout(ownGross: number, overrideGross: number, taxType: string | null | undefined) {
  const gross = ownGross + overrideGross
  const withholding = withholdingTax(gross, taxType)
  return { gross, overrideGross, ownGross, withholding, net: gross - withholding }
}
