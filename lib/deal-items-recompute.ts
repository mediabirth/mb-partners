/**
 * 案件明細化 Batch L2: 明細編集（成約前）時に deals.amount = Σ(明細reward) を再計算・保存。
 * 成約前の「見積もり」更新であり凍結には無関係（confirmed/paid は編集ルートでガード）。
 * 採用レートは案件の channel（成約前なのでゲート前の楽観値）。confirm 時は別途 effectiveKind で恒久化。
 */
import { computeDealReward } from './deal-reward'

type AdminClient = { from: (t: string) => any }

export async function recomputeDealAmount(admin: AdminClient, dealId: string): Promise<{ ok: boolean; total: number }> {
  const { data: deal } = await admin.from('deals').select('channel').eq('id', dealId).single()
  if (!deal) return { ok: false, total: 0 }
  const { data: items } = await admin.from('deal_items').select('id, service_id, menu_id, kind, amount, base_amount').eq('deal_id', dealId).order('sort')
  const list = items ?? []
  const menuIds = [...new Set(list.map((i: { menu_id: string | null }) => i.menu_id).filter(Boolean))] as string[]
  const menus = menuIds.length
    ? (await admin.from('service_menus').select('id, coop_enabled, coop_type, coop_value, coop_base, ref_type, ref_value, ref_base').in('id', menuIds)).data ?? []
    : []
  const menusById = Object.fromEntries(menus.map((m: { id: string }) => [m.id, m]))
  const { total, baseTotal, breakdown } = computeDealReward(list, deal.channel, menusById)
  const now = new Date().toISOString()
  // 各明細の reward を正規化（Σ=deals.amount を保つ）
  for (const b of breakdown) if (b.id) await admin.from('deal_items').update({ amount: b.reward, updated_at: now }).eq('id', b.id)
  await admin.from('deals').update({ amount: total, base_amount: baseTotal || null, updated_at: now }).eq('id', dealId)
  return { ok: true, total }
}
