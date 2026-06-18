/**
 * MBプロジェクトP&L（読取専用集計）。
 * MB粗利 = Σ受注額(明細) − 紹介/協力報酬(既存 deals.amount) − フロンティアoverride − その他原価
 *          − デリバリー委託費(A-2a, Σ base_fee) − デリバリー経費(A-2b, Σ承認済 expense_claims.amount)
 *
 * 重要：表示専用。deals.amount / frozen / payout_items / payout_overrides の保存値には一切書き込まない。
 * フロンティアoverride は既存 lib/frontier の式（OVERRIDE_RATE・withinWindow）をそのまま読取で再現。
 * 経費は status='approved' のみ粗利に反映（submitted/rejected は含めない）。
 */
import { OVERRIDE_RATE, withinWindow } from './frontier'

export type PnlItem = { revenue: number | null }
export type FrontierLink = { frontier_id?: string | null; frontier_linked_at?: string | null }
export type DealForOverride = { status: string; amount: number; partner_id?: string | null; fixed_month?: string | null; created_at: string }

/** 1案件が生むフロンティアoverride（既存 lib/frontier.computeOverrides と同一規則・読取専用）。 */
export function dealFrontierOverride(deal: DealForOverride, link: FrontierLink | null | undefined): number {
  if (deal.status !== 'confirmed' && deal.status !== 'paid') return 0
  if (!link?.frontier_id || !link.frontier_linked_at) return 0
  if (deal.partner_id && deal.partner_id === link.frontier_id) return 0  // 自己紐づけ除外
  const ref = deal.fixed_month ?? deal.created_at
  if (!withinWindow(link.frontier_linked_at, ref)) return 0
  return Math.round((deal.amount || 0) * OVERRIDE_RATE)
}

export type ProjectPnl = {
  revenue: number; partnerReward: number; frontierOverride: number; otherCost: number
  deliveryCost: number; deliveryExpense: number; mbMargin: number
}

export function computeProjectPnl(input: {
  items: PnlItem[]
  partnerReward: number       // 既存 deals.amount（紹介/協力報酬）
  frontierOverride: number
  otherCost: number
  deliveryCost?: number       // A-2a: Σ デリバリー委託費(base_fee)。
  deliveryExpense?: number     // A-2b: Σ 承認済(approved) 経費。submitted/rejected は含めない。
}): ProjectPnl {
  const revenue = input.items.reduce((s, it) => s + (it.revenue ?? 0), 0)
  const deliveryCost = input.deliveryCost ?? 0
  const deliveryExpense = input.deliveryExpense ?? 0
  const mbMargin = revenue - input.partnerReward - input.frontierOverride - input.otherCost - deliveryCost - deliveryExpense
  return { revenue, partnerReward: input.partnerReward, frontierOverride: input.frontierOverride, otherCost: input.otherCost, deliveryCost, deliveryExpense, mbMargin }
}
