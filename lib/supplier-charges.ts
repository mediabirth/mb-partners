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

  // 無音A(2026-07-18): 相互独立な読み取り（services/deals/カード種別）を1段に並列化＝計算式・値は完全不変（取得順のみ）。
  const [svsRes, dealsRes, spRes] = await Promise.all([
    admin.from('services').select('id').eq('supplier_partner_id', supplierId),
    admin.from('deals')
      .select('id, customer_name, company_name, amount, fixed_month, created_at, other_cost, status, fee_snapshot, deal_items(revenue)')
      .in('status', ['confirmed', 'paid'])
      .eq('fee_snapshot->>menu_supplier_partner_id', supplierId),
    admin.from('partners').select('supplier_rate_card').eq('id', supplierId).maybeSingle(),
  ])
  const svs = svsRes.data
  const deals = dealsRes.data
  const serviceIds = (svs ?? []).map((s: { id: string }) => s.id)

  const feeDeals = (deals ?? []) as Array<{ id: string; customer_name: string | null; company_name: string | null; amount: number | null; fixed_month: string | null; created_at: string; other_cost: number | null; fee_snapshot: Record<string, unknown>; deal_items: { revenue: number | null }[] | null }>

  // (a) 折半＝当該periodに帰属する half_commission 案件（サクサク: per-deal照会を並列化・結果は従来と同一）
  const halfDeals = feeDeals.filter(d => (d.fee_snapshot as { rate_kind?: string }).rate_kind === 'half_commission' && chargePeriodOf(d) === period)
  // 無音A: per-deal N+1（割当→経費）を2クエリのバッチに（deal別の集合・合算は完全同一＝値不変）
  const halfIds = halfDeals.map(d => d.id)
  const { data: asgAll } = halfIds.length ? await admin.from('delivery_assignments').select('id, deal_id, base_fee').in('deal_id', halfIds) : { data: [] as never[] }
  const asgByDeal: Record<string, { id: string; base_fee: number | null }[]> = {}
  for (const a of (asgAll ?? []) as { id: string; deal_id: string; base_fee: number | null }[]) (asgByDeal[a.deal_id] ??= []).push(a)
  const allAsgIds = ((asgAll ?? []) as { id: string }[]).map(a => a.id)
  const { data: expAll } = allAsgIds.length ? await admin.from('expense_claims').select('delivery_assignment_id, amount').in('delivery_assignment_id', allAsgIds).eq('status', 'approved') : { data: [] as never[] }
  const expByAsg: Record<string, number> = {}
  for (const e of (expAll ?? []) as { delivery_assignment_id: string; amount: number | null }[]) expByAsg[e.delivery_assignment_id] = (expByAsg[e.delivery_assignment_id] ?? 0) + (Number(e.amount) || 0)
  const halfRows = halfDeals.map(d => {
    const revenue = (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
    const asg = asgByDeal[d.id] ?? []
    const deliveryCost = asg.reduce((s: number, a: { base_fee: number | null }) => s + (Number(a.base_fee) || 0), 0)
    const deliveryExpense = asg.reduce((s: number, a: { id: string }) => s + (expByAsg[a.id] ?? 0), 0)
    const base = supplierChargeBase({ revenue, deliveryCost, deliveryExpense, otherCost: Number(d.other_cost) || 0 })
    // Feature I: 率は凍結済みfee_snapshot.rateを正とする（レートカード改定が確定済み案件に波及しない）
    const frozenRate = Number((d.fee_snapshot as { rate?: number }).rate) || FEE_RATE.half_commission
    const amount = Math.round(Math.max(0, base) * frozenRate)
    // base≦0（受注額未入力等）は凍結しない＝0円でロックせず、入力後の再クローズで拾える（凍結済みskipの対象外のため）。
    if (amount <= 0) return null
    return {
      supplier_partner_id: supplierId, deal_id: d.id, kind: 'half_commission' as const, period,
      base_amount: base, rate: frozenRate, amount,
      snapshot: { customer: d.company_name || d.customer_name, components: { revenue, deliveryCost, deliveryExpense, otherCost: Number(d.other_cost) || 0 }, fee_snapshot: d.fee_snapshot },
    }
  })
  for (const r of halfRows) if (r) rows.push(r)

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

  // (b) 決済手数料5%＝報酬総額（税抜・源泉前）。固定/率分＝成約月・継続分＝period_month（v2 §4(b)/§7-5）（並列化・結果不変）
  const p5deals = feeDeals.filter(d => (d.fee_snapshot as { rate_kind?: string }).rate_kind === 'payment_fee_5')
  const p5Ids = p5deals.map(d => d.id)
  const { data: cpsAll } = p5Ids.length ? await admin.from('continuous_payouts').select('deal_id, confirmed_amount').in('deal_id', p5Ids).eq('period_month', `${period}-01`) : { data: [] as never[] }
  const contByDeal: Record<string, number> = {}
  for (const c of (cpsAll ?? []) as { deal_id: string; confirmed_amount: number | null }[]) contByDeal[c.deal_id] = (contByDeal[c.deal_id] ?? 0) + (Number(c.confirmed_amount) || 0)
  const p5Rows = p5deals.map(d => {
    let base = 0
    const parts: Record<string, number> = {}
    if (chargePeriodOf(d) === period) { const a = Number(d.amount) || 0; if (a > 0) { base += a; parts.reward_amount = a } }
    const cont = contByDeal[d.id] ?? 0
    if (cont > 0) { base += cont; parts.continuous_amount = cont }
    if (base <= 0) return null
    const p5Rate = Number((d.fee_snapshot as { rate?: number }).rate) || FEE_RATE.payment_fee_5
    const amount = Math.round(base * p5Rate)
    return {
      supplier_partner_id: supplierId, deal_id: d.id, kind: 'payment_fee_5' as const, period,
      base_amount: base, rate: p5Rate, amount,
      snapshot: { customer: d.company_name || d.customer_name, components: parts, fee_snapshot: d.fee_snapshot, note: 'パートナー受取からは一切控除しない（上乗せ請求）' },
    }
  })
  for (const r of p5Rows) if (r) rows.push(r)

  // (d) 月額固定（レートカード駆動: monthly_fee 非nullのカード＝クローズ時点の現行カード基準・設計§4(d)）
  const sp = spRes.data
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