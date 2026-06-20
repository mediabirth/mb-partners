/**
 * 全プロジェクトP&L 集計（読取専用・ダッシュボード用）。
 * 各成約案件の MB粗利 を lib/pnl.computeProjectPnl と同一規則で算出し、月/担当/デリバリー別に集計する。
 *
 * 重要：表示専用。deals.amount / frozen / payout_items / payout_overrides / billing には一切書き込まない。
 * 新規列/テーブル（revenue, director_id, other_cost, delivery_assignments, expense_claims）は
 * best-effort 取得（未適用環境でも 0 で安全にフォールバック）。
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeProjectPnl, dealFrontierOverride } from './pnl'

export type DealPnl = {
  id: string
  customer_name: string
  ym: string | null            // 帰属月（fixed_month の YYYY-MM）
  status: string
  channel: string
  revenue: number
  revenueMissing: boolean      // 成約だが受注額(売上)が1件も入力されていない
  partnerReward: number
  frontierOverride: number
  otherCost: number
  deliveryCost: number         // Σ デリバリー委託費(base_fee)
  deliveryExpense: number      // Σ 承認済(approved)経費
  mbMargin: number
  directorId: string | null
  vendorRows: { deliveryId: string; fee: number; expense: number }[]
}

export type PnlAggregate = {
  rows: DealPnl[]
  directorName: Record<string, string>
  deliveryName: Record<string, string>
}

/** 成約(confirmed/paid)案件を対象に、案件別の正確なP&L行を返す。 */
export async function loadProjectPnl(admin: SupabaseClient): Promise<PnlAggregate> {
  // ① 案件本体（P&L列込み・段階フォールバック）。他クエリと結果依存が無い → 取得のみ並列化。
  const SEL = 'id, customer_name, channel, status, amount, fixed_month, created_at, partner_id'
  const dealsP: Promise<Record<string, unknown>[]> = (async () => {
    const r = await admin.from('deals').select(`${SEL}, director_id, other_cost`).in('status', ['confirmed', 'paid'])
    let d = r.data as Record<string, unknown>[] | null
    if (!d) { const r2 = await admin.from('deals').select(SEL).in('status', ['confirmed', 'paid']); d = r2.data as Record<string, unknown>[] | null }
    return d ?? []
  })()
  // best-effort 読取：テーブル/列未適用での throw を null に畳む（従来 try/catch と同義）。クエリ・select は不変。
  const safe = (p: PromiseLike<{ data: unknown }>) => Promise.resolve(p).then(r => r, () => ({ data: null as unknown }))
  const itemsP     = safe(admin.from('deal_items').select('deal_id, revenue'))
  const assignsP   = safe(admin.from('delivery_assignments').select('id, deal_id, delivery_id, base_fee, deliveries(name)'))
  const expensesP  = safe(admin.from('expense_claims').select('delivery_assignment_id, amount, status'))
  const assigns2P  = safe(admin.from('delivery_assignments').select('id, deal_id, delivery_id'))
  const expenses2P = safe(admin.from('expense_claims').select('delivery_assignment_id, amount, status'))
  const partnersP  = safe(admin.from('partners').select('id, frontier_id, frontier_linked_at'))
  const profilesP  = safe(admin.from('profiles').select('id, name').neq('role', 'partner'))

  // 逐次 await の waterfall を1回の Promise.all へ。各クエリは独立・共有可変状態なし。
  // 以降の集計（map構築）は従来と同一の順序・同一ロジックで実行＝結果(表示額)は完全一致。
  const [deals, itemsRes, assignsRes, expensesRes, assigns2Res, expenses2Res, partnersRes, profilesRes] = await Promise.all([
    dealsP, itemsP, assignsP, expensesP, assigns2P, expenses2P, partnersP, profilesP,
  ])

  // ② 明細（受注額/売上）
  const itemsByDeal: Record<string, { revenue: number | null }[]> = {}
  for (const it of (itemsRes.data ?? []) as Array<{ deal_id: string; revenue: number | null }>) {
    (itemsByDeal[it.deal_id] ??= []).push({ revenue: it.revenue ?? null })
  }

  // ③ デリバリー割当（委託費）＋ ④ 承認済経費
  const assignToDeal: Record<string, string> = {}
  const feeByDeal: Record<string, number> = {}
  const vendorByDeal: Record<string, Record<string, { fee: number; expense: number }>> = {}
  const deliveryName: Record<string, string> = {}
  for (const a of (assignsRes.data ?? []) as Array<{ id: string; deal_id: string; delivery_id: string | null; base_fee: number; deliveries: { name: string } | null }>) {
    assignToDeal[a.id] = a.deal_id
    feeByDeal[a.deal_id] = (feeByDeal[a.deal_id] ?? 0) + (a.base_fee ?? 0)
    if (a.delivery_id) {
      if (a.deliveries?.name) deliveryName[a.delivery_id] = a.deliveries.name
      const vmap = (vendorByDeal[a.deal_id] ??= {})
      const v = (vmap[a.delivery_id] ??= { fee: 0, expense: 0 })
      v.fee += a.base_fee ?? 0
    }
  }

  const approvedExpenseByDeal: Record<string, number> = {}
  for (const e of (expensesRes.data ?? []) as Array<{ delivery_assignment_id: string; amount: number; status: string }>) {
    if (e.status !== 'approved') continue
    const dealId = assignToDeal[e.delivery_assignment_id]
    if (!dealId) continue
    approvedExpenseByDeal[dealId] = (approvedExpenseByDeal[dealId] ?? 0) + (e.amount ?? 0)
  }

  // 経費を vendor別に帰属（割当id→delivery_id を引くため再走査）
  {
    const assignDelivery: Record<string, { dealId: string; deliveryId: string | null }> = {}
    for (const a of (assigns2Res.data ?? []) as Array<{ id: string; deal_id: string; delivery_id: string | null }>) assignDelivery[a.id] = { dealId: a.deal_id, deliveryId: a.delivery_id }
    for (const e of (expenses2Res.data ?? []) as Array<{ delivery_assignment_id: string; amount: number; status: string }>) {
      if (e.status !== 'approved') continue
      const link = assignDelivery[e.delivery_assignment_id]
      if (!link?.deliveryId) continue
      const vmap = (vendorByDeal[link.dealId] ??= {})
      const v = (vmap[link.deliveryId] ??= { fee: 0, expense: 0 })
      v.expense += e.amount ?? 0
    }
  }

  // ⑤ フロンティアoverride 用の partner link
  const partnerLink: Record<string, { frontier_id?: string | null; frontier_linked_at?: string | null }> = {}
  for (const p of (partnersRes.data ?? []) as Array<{ id: string; frontier_id: string | null; frontier_linked_at: string | null }>) {
    partnerLink[p.id] = { frontier_id: p.frontier_id, frontier_linked_at: p.frontier_linked_at }
  }

  // ⑥ MB担当名
  const directorName: Record<string, string> = {}
  for (const p of (profilesRes.data ?? []) as Array<{ id: string; name: string }>) directorName[p.id] = p.name

  const rows: DealPnl[] = deals.map(d => {
    const id = d.id as string
    const items = itemsByDeal[id] ?? []
    const otherCost = Number((d as { other_cost?: number | null }).other_cost ?? 0) || 0
    const deliveryCost = feeByDeal[id] ?? 0
    const deliveryExpense = approvedExpenseByDeal[id] ?? 0
    const frontierOverride = dealFrontierOverride(
      d as { status: string; amount: number; partner_id?: string | null; fixed_month?: string | null; created_at: string },
      partnerLink[(d.partner_id as string) ?? ''] ?? null,
    )
    const pnl = computeProjectPnl({
      items, partnerReward: Number(d.amount ?? 0), frontierOverride, otherCost, deliveryCost, deliveryExpense,
    })
    const hasAnyRevenue = items.some(i => i.revenue != null)
    const vmap = vendorByDeal[id] ?? {}
    return {
      id,
      customer_name: (d.customer_name as string) ?? '',
      ym: (d.fixed_month as string | null)?.slice(0, 7) ?? null,
      status: d.status as string,
      channel: d.channel as string,
      revenue: pnl.revenue,
      revenueMissing: !hasAnyRevenue,
      partnerReward: pnl.partnerReward,
      frontierOverride: pnl.frontierOverride,
      otherCost: pnl.otherCost,
      deliveryCost: pnl.deliveryCost,
      deliveryExpense: pnl.deliveryExpense,
      mbMargin: pnl.mbMargin,
      directorId: (d as { director_id?: string | null }).director_id ?? null,
      vendorRows: Object.entries(vmap).map(([deliveryId, v]) => ({ deliveryId, fee: v.fee, expense: v.expense })),
    }
  })

  return { rows, directorName, deliveryName }
}

/** 月集計（帰属月＝fixed_month の YYYY-MM が ymKey 一致の成約案件）。 */
export function sumMonth(rows: DealPnl[], ymKey: string) {
  const m = rows.filter(d => d.ym === ymKey)
  const s = (sel: (r: DealPnl) => number) => m.reduce((a, r) => a + sel(r), 0)
  return {
    count: m.length,
    revenue: s(r => r.revenue),
    partnerReward: s(r => r.partnerReward),
    frontierOverride: s(r => r.frontierOverride),
    otherCost: s(r => r.otherCost),
    deliveryCost: s(r => r.deliveryCost),
    deliveryExpense: s(r => r.deliveryExpense),
    mbMargin: s(r => r.mbMargin),
    revenueMissing: m.filter(r => r.revenueMissing).length,
    rows: m,
  }
}
