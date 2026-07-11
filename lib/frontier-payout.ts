// R2-E/凍結: payout に override を合算。
// - 締め済み(closed)/支払済(paid) は payout_overrides に「締め時点の料率・紐づけ・金額」で凍結し、以後動かさない。
// - 未締め(open) はライブ再計算（現行どおり）。
// - payout_overrides テーブル未作成（DDL未実行）時は全てライブにフォールバック（halt しない）。
import { computeOverrides, combinedPayout, OVERRIDE_RATE, type SupplierFrontiers } from '@/lib/frontier'

type AnyClient = { from: (t: string) => any }

/**
 * P0-b: サプライヤー（会社フロンティア）メタの読取（設計v2 §4(c)改修2）。
 * services.supplier_partner_id 結線のあるフロンティア → { active: partners.status==='active' }。
 * 読取失敗時は {}（＝全員「個人フロンティア扱い」＝従来の12ヶ月窓・fail-safe）。
 */
export async function loadSupplierFrontiers(admin: AnyClient): Promise<SupplierFrontiers> {
  try {
    const { data: sv } = await admin.from('services').select('supplier_partner_id').not('supplier_partner_id', 'is', null)
    const ids = [...new Set((sv ?? []).map((s: { supplier_partner_id: string }) => s.supplier_partner_id))]
    if (!ids.length) return {}
    const { data: ps } = await admin.from('partners').select('id, status').in('id', ids)
    const out: SupplierFrontiers = {}
    for (const p of (ps ?? []) as { id: string; status: string | null }[]) out[p.id] = { active: p.status === 'active' }
    return out
  } catch { return {} }
}

async function loadDealsAndLinks(admin: AnyClient) {
  const [{ data: deals }, { data: partners }, supplierFrontiers] = await Promise.all([
    admin.from('deals').select('partner_id, amount, status, fixed_month, created_at, fee_snapshot'),
    admin.from('partners').select('id, code, tax_type, frontier_id, frontier_linked_at, profiles(name, color)'),
    loadSupplierFrontiers(admin),
  ])
  const linkById: Record<string, { frontier_id: string | null; frontier_linked_at: string | null }> = {}
  const metaById: Record<string, { code: string; tax_type: string | null; name: string; color: string }> = {}
  for (const p of partners ?? []) {
    linkById[p.id] = { frontier_id: p.frontier_id, frontier_linked_at: p.frontier_linked_at }
    metaById[p.id] = { code: p.code, tax_type: p.tax_type, name: p.profiles?.name ?? p.code, color: p.profiles?.color ?? '#4733E6' }
  }
  return { deals: deals ?? [], linkById, metaById, supplierFrontiers }
}

/**
 * 締め時点の override を凍結（payout_overrides に upsert）。close 直後に呼ぶ。
 * テーブル未作成時は no-op（false）。
 */
export async function freezeOverridesForBatch(admin: AnyClient, batchId: string, ym: string): Promise<boolean> {
  try {
    // P0-b③: 凍結済みバッチは再凍結しない（設計v2 §4(c)改修3）。
    //   backfill（freeze-overrides）を後から再実行しても「現時点の料率・紐づけ」で過去の凍結値が書き換わらない＝凍結は不変。
    const ex = await admin.from('payout_overrides').select('batch_id', { count: 'exact', head: true }).eq('batch_id', batchId)
    if (ex.error) return false // テーブル未作成
    if ((ex.count ?? 0) > 0) return true // 凍結済み＝skip（不変）
    const { deals, linkById, supplierFrontiers } = await loadDealsAndLinks(admin)
    const overrides = computeOverrides(deals, linkById, ym, supplierFrontiers)
    const rows = Object.entries(overrides)
      .filter(([, g]) => g > 0)
      .map(([frontier_id, override_gross]) => ({ batch_id: batchId, frontier_id, override_gross, rate: OVERRIDE_RATE }))
    if (rows.length) {
      const { error } = await admin.from('payout_overrides').insert(rows)
      if (error) return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * batches に override を合算。closed/paid は凍結値、open はライブ。
 */
export async function augmentBatches(admin: AnyClient, batches: any[]): Promise<any[]> {
  if (!batches?.length) return batches ?? []

  const { deals, linkById, metaById, supplierFrontiers } = await loadDealsAndLinks(admin)

  // 凍結値をまとめて取得（テーブル未作成なら null）
  const batchIds = batches.map(b => b.id)
  let frozenByBatch: Record<string, Record<string, number>> = {}
  let hasFrozenTable = true
  try {
    const { data: frozen, error } = await admin.from('payout_overrides').select('batch_id, frontier_id, override_gross').in('batch_id', batchIds)
    if (error) hasFrozenTable = false
    for (const f of frozen ?? []) {
      ;(frozenByBatch[f.batch_id] ??= {})[f.frontier_id] = f.override_gross
    }
  } catch { hasFrozenTable = false }

  for (const b of batches) {
    const ym = String(b.month).slice(0, 7)
    const isClosed = b.status === 'closed' || b.status === 'paid'
    // closed/paid かつ凍結あり → 凍結値。それ以外（open / 凍結未作成）→ ライブ。
    const overrides = (isClosed && hasFrozenTable && frozenByBatch[b.id])
      ? frozenByBatch[b.id]
      : computeOverrides(deals, linkById, ym, supplierFrontiers)

    const items: any[] = b.payout_items ?? []
    const byPartner: Record<string, any> = {}
    for (const it of items) byPartner[it.partner_id] = it

    for (const [frontierId, ovGross] of Object.entries(overrides)) {
      if (!ovGross || ovGross <= 0) continue
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
    for (const it of items) {
      if (it.override_gross == null) {
        it.override_gross = 0
        it.combined_gross = it.gross
        it.combined_withholding = it.withholding
        it.combined_net = it.net
      }
    }
    b.payout_items = items
    b.frozen_overrides = isClosed && hasFrozenTable && !!frozenByBatch[b.id]
  }
  return batches
}
