/**
 * デリバリー（業務委託先）支払の算出（独立ストリーム・読取）。
 * 成約(confirmed/paid)案件の delivery_assignment ごとに 支払額 = base_fee + Σ承認済経費。
 * 帰属月＝案件の成約月（fixed_month 優先、なければ created_at）の YYYY-MM。
 *
 * 重要：パートナー支払（payout_items / payout_overrides / close_month_batch / frontier-payout / lib/payout）
 * とは一切共有しない。ここは「デリバリーへ払うお金」だけを扱う別テーブル(delivery_payout_items)用の素材。
 * MB粗利(lib/pnl)はこのモジュールを参照しない＝二重計上なし。
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type DeliveryPayoutLine = {
  deliveryId: string
  dealId: string
  dealItemId: string | null
  customerName: string
  baseFee: number
  expenseTotal: number   // 承認済(approved)経費のみ
  amount: number         // baseFee + expenseTotal
  period: string         // YYYY-MM（成約月帰属）
}

/** (案件×明細×委託先×月) を一意化するキー。凍結済み判定・突合に使用。 */
export function payoutKey(p: { deliveryId: string; dealId: string; dealItemId: string | null; period: string }): string {
  return `${p.deliveryId}|${p.dealId}|${p.dealItemId ?? '-'}|${p.period}`
}

/** 成約案件のデリバリー割当を支払行（凍結前のライブ値）に展開して返す。delivery_id 無し(MB自身)は対象外。 */
export async function computeDeliveryPayoutLines(admin: SupabaseClient): Promise<{
  lines: DeliveryPayoutLine[]
  deliveryName: Record<string, string>
}> {
  // 成約案件のみ（帰属月の算出に使う）
  const dealInfo: Record<string, { period: string; customerName: string }> = {}
  {
    const { data } = await admin.from('deals')
      .select('id, customer_name, status, fixed_month, created_at')
      .in('status', ['confirmed', 'paid'])
    for (const d of (data ?? []) as Array<{ id: string; customer_name: string; fixed_month: string | null; created_at: string }>) {
      dealInfo[d.id] = { period: (d.fixed_month ?? d.created_at).slice(0, 7), customerName: d.customer_name ?? '' }
    }
  }

  // 割当（base_fee）。delivery_id 無しは MB自身＝対象外。
  const deliveryName: Record<string, string> = {}
  const assignToDeal: Record<string, { dealId: string; deliveryId: string; dealItemId: string | null }> = {}
  const lineByAssign: Record<string, DeliveryPayoutLine> = {}
  {
    const { data } = await admin.from('delivery_assignments')
      .select('id, deal_id, deal_item_id, delivery_id, base_fee, deliveries(name)')
    for (const a of (data ?? []) as unknown as Array<{ id: string; deal_id: string; deal_item_id: string | null; delivery_id: string | null; base_fee: number; deliveries: { name: string } | null }>) {
      if (!a.delivery_id) continue                 // MB自身（委託費0）は支払対象外
      const info = dealInfo[a.deal_id]
      if (!info) continue                          // 成約前の案件は対象外
      if (a.deliveries?.name) deliveryName[a.delivery_id] = a.deliveries.name
      assignToDeal[a.id] = { dealId: a.deal_id, deliveryId: a.delivery_id, dealItemId: a.deal_item_id }
      lineByAssign[a.id] = {
        deliveryId: a.delivery_id, dealId: a.deal_id, dealItemId: a.deal_item_id,
        customerName: info.customerName, baseFee: a.base_fee ?? 0, expenseTotal: 0,
        amount: a.base_fee ?? 0, period: info.period,
      }
    }
  }

  // 承認済経費を割当に加算
  {
    const { data } = await admin.from('expense_claims').select('delivery_assignment_id, amount, status')
    for (const e of (data ?? []) as Array<{ delivery_assignment_id: string; amount: number; status: string }>) {
      if (e.status !== 'approved') continue
      const line = lineByAssign[e.delivery_assignment_id]
      if (!line) continue
      line.expenseTotal += e.amount ?? 0
      line.amount = line.baseFee + line.expenseTotal
    }
  }

  return { lines: Object.values(lineByAssign), deliveryName }
}
