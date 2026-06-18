/**
 * 案件明細化 Phase 1（基盤）: deal_items の最小ヘルパー。
 * 今回は明細を「持つ」だけで「使わない」（reward計算は従来どおり deals.amount を読む）。
 * すべて best-effort / fail-open：deal_items 未作成（DDL前）でも deal 作成を一切壊さない。
 * service_role クライアントを受け取る（deal_items は service_role のみ）。
 */
type AdminClient = { from: (t: string) => any }

type MenuLike = { ref_type?: string | null; coop_type?: string | null } | null | undefined

/** 明細の種別（fixed/rate）を channel とメニューから導出。 */
export function dealItemKind(channel: string, menu: MenuLike): 'fixed' | 'rate' {
  if (channel === 'cooperation' || channel === 'frontier') return menu?.coop_type === 'rate' ? 'rate' : 'fixed'
  if (channel === 'referral') return menu?.ref_type === 'rate' ? 'rate' : 'fixed'
  return 'fixed'
}

/**
 * deal 作成時に対応する明細1行を同時に書く（外見は不変・内部のみ）。
 * deals.amount = SUM(deal_items.amount) の不変条件を作成時点で満たすため amount/base をそのまま写す。
 */
export async function createDealItem(admin: AdminClient, p: {
  deal_id: string; service_id: string | null; menu_id?: string | null
  kind: 'fixed' | 'rate'; amount: number; base_amount?: number | null; sort?: number
}): Promise<void> {
  try {
    await admin.from('deal_items').insert({
      deal_id: p.deal_id,
      service_id: p.service_id ?? null,
      menu_id: p.menu_id ?? null,
      kind: p.kind,
      amount: p.amount ?? 0,
      base_amount: p.base_amount ?? null,
      sort: p.sort ?? 0,
    })
  } catch { /* best-effort: テーブル未作成(DDL前)は no-op */ }
}
