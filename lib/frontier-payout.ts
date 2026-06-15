// R2-E: payout_items に override を合算（snapshot不変・表示/集計/CSV用にサーバ側で導出）。
import { computeOverrides, combinedPayout } from '@/lib/frontier'

type AnyClient = { from: (t: string) => any }

export type AugmentedItem = {
  id?: string
  partner_id: string
  gross: number
  withholding: number
  net: number
  statement?: any
  partners?: any
  override_gross: number          // 配下オーバーライド合計
  combined_gross: number          // 自分＋override
  combined_withholding: number
  combined_net: number
  synthetic?: boolean             // 自分の payout_item が無く override のみ
}

/**
 * batches（payout_batches + payout_items 入り）に override を合算して返す。
 * 各バッチ月の確定/支払 deal から、フロンティア別 override を算出し、
 * フロンティアの item に上乗せ（item 無ければ override のみの行を追加）。
 */
export async function augmentBatches(admin: AnyClient, batches: any[]): Promise<any[]> {
  if (!batches?.length) return batches ?? []

  const [{ data: deals }, { data: partners }] = await Promise.all([
    admin.from('deals').select('partner_id, amount, status, fixed_month, created_at'),
    admin.from('partners').select('id, code, tax_type, frontier_id, frontier_linked_at, profiles(name, color)'),
  ])
  const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
  const metaById: Record<string, { code: string; tax_type: string | null; name: string; color: string }> = {}
  for (const p of partners ?? []) {
    linkById[p.id] = { frontier_id: p.frontier_id, frontier_linked_at: p.frontier_linked_at }
    metaById[p.id] = { code: p.code, tax_type: p.tax_type, name: p.profiles?.name ?? p.code, color: p.profiles?.color ?? '#4733E6' }
  }

  for (const b of batches) {
    const ym = String(b.month).slice(0, 7)
    const overrides = computeOverrides(deals ?? [], linkById, ym)
    const items: any[] = b.payout_items ?? []
    const byPartner: Record<string, any> = {}
    for (const it of items) byPartner[it.partner_id] = it

    for (const [frontierId, ovGross] of Object.entries(overrides)) {
      if (ovGross <= 0) continue
      const meta = metaById[frontierId]
      const taxType = meta?.tax_type ?? 'individual'
      const existing = byPartner[frontierId]
      if (existing) {
        const c = combinedPayout(existing.gross, ovGross, existing.statement?.tax_type ?? taxType)
        existing.override_gross = ovGross
        existing.combined_gross = c.gross
        existing.combined_withholding = c.withholding
        existing.combined_net = c.net
      } else {
        const c = combinedPayout(0, ovGross, taxType)
        items.push({
          id: `override-${b.id}-${frontierId}`,
          partner_id: frontierId,
          gross: 0, withholding: 0, net: 0,
          statement: { tax_type: taxType, override_only: true },
          partners: { code: meta?.code ?? '', profiles: { name: meta?.name ?? '', color: meta?.color ?? '#4733E6' } },
          override_gross: ovGross,
          combined_gross: c.gross, combined_withholding: c.withholding, combined_net: c.net,
          synthetic: true,
        })
      }
    }
    // override の無い通常 item にも combined_* を埋める（表示統一）
    for (const it of items) {
      if (it.override_gross == null) {
        it.override_gross = 0
        it.combined_gross = it.gross
        it.combined_withholding = it.withholding
        it.combined_net = it.net
      }
    }
    b.payout_items = items
  }
  return batches
}
