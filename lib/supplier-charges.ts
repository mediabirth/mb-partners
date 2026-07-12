/**
 * サプライヤー請求の算出（凍結前の計算・単一ソース）。
 * console のクローズ/プレビューと、サプライヤーポータル（本人向け・自社分のみ）で共用する。
 * ★payout_*（MBが払う側）・reward_snapshot・deals.amount には一切非接触（P0-a境界）。
 */
import { supplierChargeBase, chargePeriodOf, FEE_RATE, loadRateCard, STD_RATE_CARD } from '@/lib/supplier-fee'

type AnyClient = { from: (t: string) => any }

export type ChargeRow = {
  supplier_partner_id: string
  deal_id: string | null
  kind: 'half_commission' | 'passthrough_revenue_fee' | 'payment_fee_5' | 'omnis_monthly'
  period: string
  base_amount: number
  rate: number | null
  amount: number
  snapshot: Record<string, unknown>
}

/** クローズ対象の算出（プレビューと凍結で同一計算＝乖離ゼロ）。 */
export async function computeCharges(admin: AnyClient, supplierId: string, period: string): Promise<{ rows: ChargeRow[]; warnings: string[] }> {
  const rows: ChargeRow[] = []
  const warnings: string[] = []

  // サプライヤー配下サービス（null検知警告用）
  const { data: svs } = await admin.from('services').select('id').eq('supplier_partner_id', supplierId)
  const serviceIds = (svs ?? []).map((s: { id: string }) => s.id)

  // 対象 deal（条件凍結済み・confirmed/paid）
  const { data: deals } = await admin
    .from('deals')
    .select('id, customer_name, company_name, amount, fixed_month, created_at, other_cost, status, fee_snapshot, deal_items(revenue)')
    .in('status', ['confirmed', 'paid'])
    .eq('fee_snapshot->>menu_supplier_partner_id', supplierId)

  const feeDeals = (deals ?? []) as Array<{ id: string; customer_name: string | null; company_name: string | null; amount: number | null; fixed_month: string | null; created_at: string; other_cost: number | null; fee_snapshot: Record<string, unknown>; deal_items: { revenue: number | null }[] | null }>

  // (a) 折半＝当該periodに帰属する half_commission 案件
  for (const d of feeDeals) {
    if ((d.fee_snapshot as { rate_kind?: string }).rate_kind !== 'half_commission') continue
    if (chargePeriodOf(d) !== period) continue
    const revenue = (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
    // 委託費・承認済経費（Phase 0規模のためdeal毎照会で十分）
    const { data: asg } = await admin.from('delivery_assignments').select('id, base_fee').eq('deal_id', d.id)
    const deliveryCost = (asg ?? []).reduce((s: number, a: { base_fee: number | null }) => s + (Number(a.base_fee) || 0), 0)
    let deliveryExpense = 0
    const asgIds = (asg ?? []).map((a: { id: string }) => a.id)
    if (asgIds.length) {
      const { data: exp } = await admin.from('expense_claims').select('amount').in('delivery_assignment_id', asgIds).eq('status', 'approved')
      deliveryExpense = (exp ?? []).reduce((s: number, e: { amount: number | null }) => s + (Number(e.amount) || 0), 0)
    }
    const base = supplierChargeBase({ revenue, deliveryCost, deliveryExpense, otherCost: Number(d.other_cost) || 0 })
    // Feature I: 率は凍結済みfee_snapshot.rateを正とする（レートカード改定が確定済み案件に波及しない）
    const frozenRate = Number((d.fee_snapshot as { rate?: number }).rate) || FEE_RATE.half_commission
    const amount = Math.round(Math.max(0, base) * frozenRate)
    // base≦0（受注額未入力等）は凍結しない＝0円でロックせず、入力後の再クローズで拾える（凍結済みskipの対象外のため）。
    if (amount <= 0) continue
    rows.push({
      supplier_partner_id: supplierId, deal_id: d.id, kind: 'half_commission', period,
      base_amount: base, rate: frozenRate, amount,
      snapshot: { customer: d.company_name || d.customer_name, components: { revenue, deliveryCost, deliveryExpense, otherCost: Number(d.other_cost) || 0 }, fee_snapshot: d.fee_snapshot },
    })
  }

  // (a2) パススルー手数料（Feature I-2・standard-v2）＝受注額(税抜)×凍結済みrate。
  //   粗利ベースを採らない＝原価申告に依存しない検証可能な基準。パートナー報酬はパススルー（控除なし・別建て請求）。
  for (const d of feeDeals) {
    if ((d.fee_snapshot as { rate_kind?: string }).rate_kind !== 'passthrough_revenue_fee') continue
    if (chargePeriodOf(d) !== period) continue
    const revenue = (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
    const frozenRate = Number((d.fee_snapshot as { rate?: number }).rate) || 0.05
    const amount = Math.round(Math.max(0, revenue) * frozenRate)
    // 受注額未入力（0）は凍結しない＝入力後の再クローズで拾える（折半と同じ規則）
    if (amount <= 0) continue
    rows.push({
      supplier_partner_id: supplierId, deal_id: d.id, kind: 'passthrough_revenue_fee', period,
      base_amount: revenue, rate: frozenRate, amount,
      snapshot: { customer: d.company_name || d.customer_name, components: { revenue }, fee_snapshot: d.fee_snapshot, note: '報酬はパススルー（控除なし）・MB手数料=受注額(税抜)ベース' },
    })
  }

  // (b) 決済手数料5%＝報酬総額（税抜・源泉前）。固定/率分＝成約月・継続分＝period_month（v2 §4(b)/§7-5）
  const p5deals = feeDeals.filter(d => (d.fee_snapshot as { rate_kind?: string }).rate_kind === 'payment_fee_5')
  for (const d of p5deals) {
    let base = 0
    const parts: Record<string, number> = {}
    if (chargePeriodOf(d) === period) { const a = Number(d.amount) || 0; if (a > 0) { base += a; parts.reward_amount = a } }
    const { data: cps } = await admin.from('continuous_payouts').select('confirmed_amount').eq('deal_id', d.id).eq('period_month', `${period}-01`)
    const cont = (cps ?? []).reduce((s: number, c: { confirmed_amount: number | null }) => s + (Number(c.confirmed_amount) || 0), 0)
    if (cont > 0) { base += cont; parts.continuous_amount = cont }
    if (base <= 0) continue
    const p5Rate = Number((d.fee_snapshot as { rate?: number }).rate) || FEE_RATE.payment_fee_5
    const amount = Math.round(base * p5Rate)
    rows.push({
      supplier_partner_id: supplierId, deal_id: d.id, kind: 'payment_fee_5', period,
      base_amount: base, rate: p5Rate, amount,
      snapshot: { customer: d.company_name || d.customer_name, components: parts, fee_snapshot: d.fee_snapshot, note: 'パートナー受取からは一切控除しない（上乗せ請求）' },
    })
  }

  // (d) 月額固定（レートカード駆動: monthly_fee 非nullのカード＝クローズ時点の現行カード基準・設計§4(d)）
  const { data: sp } = await admin.from('partners').select('supplier_rate_card').eq('id', supplierId).maybeSingle()
  const card = await loadRateCard(admin, (sp?.supplier_rate_card as string | null) ?? STD_RATE_CARD)
  if (card.monthly_fee != null) {
    rows.push({
      supplier_partner_id: supplierId, deal_id: null, kind: 'omnis_monthly', period,
      base_amount: card.monthly_fee, rate: null, amount: card.monthly_fee,
      snapshot: { note: '月額固定（決済手数料に代えて・税別）', rate_card: card.id },
    })
  }

  // null検知警告（設計§2フォールバック）: サプライヤーメニューの confirmed/paid で fee_snapshot 無し
  if (serviceIds.length) {
    const { data: nullDeals } = await admin
      .from('deals').select('id, customer_name')
      .in('status', ['confirmed', 'paid']).in('service_id', serviceIds).is('fee_snapshot', null)
    for (const nd of (nullDeals ?? []) as { id: string; customer_name: string | null }[]) {
      warnings.push(`fee_snapshot未凍結: ${nd.customer_name ?? nd.id}（成約を一度開き直して再確定するか、実装バッチへ報告）`)
    }
  }

  return { rows, warnings }
}