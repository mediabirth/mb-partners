/**
 * サプライヤー請求（P0-a・仕様正典: docs/design/lineage-rate-design.md v2 §4/§7）。
 * GET  — サプライヤー一覧＋凍結済み請求一覧＋（supplier&period指定時）クローズプレビュー
 * POST — 月次請求クローズ＝金額の凍結（第2段）。(a)折半・(b)決済5%・(d)月額 の3種。凍結済みは不変（skip）。
 * ★MBが「請求する」側の独立ドメイン。payout_*（MBが払う側）・reward_snapshot・deals.amount には一切非接触。
 * ★パートナー受取不減額の構造保証＝本テーブルは支払計算のどこからも参照されない。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { supplierChargeBase, chargePeriodOf, FEE_RATE, loadRateCard, STD_RATE_CARD } from '@/lib/supplier-fee'

export const runtime = 'nodejs'

async function requireOpsWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) return null
  return user
}

type ChargeRow = {
  supplier_partner_id: string
  deal_id: string | null
  kind: 'half_commission' | 'payment_fee_5' | 'omnis_monthly'
  period: string
  base_amount: number
  rate: number | null
  amount: number
  snapshot: Record<string, unknown>
}

/** クローズ対象の算出（プレビューと凍結で同一計算＝乖離ゼロ）。 */
async function computeCharges(admin: Awaited<ReturnType<typeof createServiceRoleClient>>, supplierId: string, period: string): Promise<{ rows: ChargeRow[]; warnings: string[] }> {
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

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireOpsWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const url = new URL(req.url)
  const supplierId = url.searchParams.get('supplier')
  const period = url.searchParams.get('period')

  // サプライヤー一覧（services.supplier_partner_id の distinct）
  const { data: svc } = await admin.from('services').select('supplier_partner_id').not('supplier_partner_id', 'is', null)
  const ids = [...new Set((svc ?? []).map((s: { supplier_partner_id: string }) => s.supplier_partner_id))]
  let suppliers: { id: string; name: string; code: string | null; rate_card: string }[] = []
  if (ids.length) {
    const { data: ps } = await admin.from('partners').select('id, code, supplier_rate_card, profiles(name)').in('id', ids)
    suppliers = (ps ?? []).map((p: { id: string; code: string | null; supplier_rate_card: string | null; profiles: { name: string | null } | null }) => ({
      id: p.id, code: p.code, name: p.profiles?.name ?? p.code ?? p.id.slice(0, 8), rate_card: p.supplier_rate_card ?? STD_RATE_CARD,
    }))
  }

  const { data: charges } = await admin
    .from('supplier_charges')
    .select('id, supplier_partner_id, deal_id, kind, period, base_amount, rate, amount, status, frozen_at, invoiced_at, settled_at, snapshot')
    .order('period', { ascending: false }).order('created_at', { ascending: false }).limit(500)

  let preview: { rows: ChargeRow[]; warnings: string[] } | null = null
  if (supplierId && period && /^\d{4}-\d{2}$/.test(period)) preview = await computeCharges(admin, supplierId, period)

  return NextResponse.json({ suppliers, charges: charges ?? [], preview })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireOpsWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const supplierId = typeof b.supplier_partner_id === 'string' ? b.supplier_partner_id : ''
  const period = typeof b.period === 'string' ? b.period : ''
  if (!supplierId || !/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: 'supplier_partner_id と period(YYYY-MM) は必須です' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const { rows, warnings } = await computeCharges(admin, supplierId, period)

  // 凍結済みは不変（skip）＝多重凍結防止（設計§2第2段・invoiced以降は解除も不可）
  const { data: existing } = await admin.from('supplier_charges').select('deal_id, kind').eq('supplier_partner_id', supplierId).eq('period', period)
  const seen = new Set((existing ?? []).map((e: { deal_id: string | null; kind: string }) => `${e.deal_id ?? 'flat'}|${e.kind}`))
  const fresh = rows.filter(r => !seen.has(`${r.deal_id ?? 'flat'}|${r.kind}`))

  if (fresh.length) {
    const { error } = await admin.from('supplier_charges').insert(fresh.map(r => ({ ...r, status: 'unbilled' })))
    if (error) return NextResponse.json({ error: '凍結に失敗しました: ' + error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, frozen: fresh.length, skipped: rows.length - fresh.length, warnings })
}
