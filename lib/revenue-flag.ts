/**
 * 受注額の乖離琥珀フラグ（ベンダー純化P2・vendor-redesign.md §3(b)）。
 * 目的＝入力ミス（桁ずれ）検出兼、相場からの大幅乖離の静かな可視化。
 * ★保存は絶対にブロックしない・money（報酬/請求/凍結）には一切非接触＝表示専用の導出値。
 * 判定: 同一メニューの確定済み受注額（直近90日・自案件除く）
 *   N>=3 → 中央値から±70%超で乖離（琥珀）
 *   1<=N<3 → 中央値から1桁（×10/÷10）ずれのみ乖離（緩い帯）
 *   N==0 → メニュー報酬設定から逆算した想定受注額（fixed報酬×10）から1桁ずれのみ（参照不能なら判定しない）
 */
import { REVENUE_DEVIATION } from '@/lib/supplier-fee'

export type RevenueFlag = { median: number | null; n: number; kind: 'median' | 'sparse' | 'estimate' }

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2) }

/** 単一判定（純関数）: revenue と 参照値集合から乖離を返す。null=乖離なし。 */
export function judgeDeviation(revenue: number, peers: number[], estimate: number | null): RevenueFlag | null {
  if (!Number.isFinite(revenue) || revenue <= 0) return null
  const n = peers.length
  if (n >= REVENUE_DEVIATION.minSamples) {
    const med = median(peers)
    if (med > 0 && (revenue > med * (1 + REVENUE_DEVIATION.ratio) || revenue < med * (1 - REVENUE_DEVIATION.ratio))) {
      return { median: med, n, kind: 'median' }
    }
    return null
  }
  if (n >= 1) {
    const med = median(peers)
    if (med > 0 && (revenue >= med * REVENUE_DEVIATION.sparseMagnitude || revenue <= med / REVENUE_DEVIATION.sparseMagnitude)) {
      return { median: med, n, kind: 'sparse' }
    }
    return null
  }
  if (estimate && estimate > 0 && (revenue >= estimate * REVENUE_DEVIATION.sparseMagnitude || revenue <= estimate / REVENUE_DEVIATION.sparseMagnitude)) {
    return { median: estimate, n: 0, kind: 'estimate' }
  }
  return null
}

type Db = { from: (t: string) => any }

/** メニュー別の参照受注額（直近90日・confirmed/paid・revenue>0）を一括取得して Map で返す。 */
export async function loadPeerRevenues(admin: Db, menuIds: string[]): Promise<Map<string, { dealId: string; revenue: number; at: string }[]>> {
  const map = new Map<string, { dealId: string; revenue: number; at: string }[]>()
  const ids = [...new Set(menuIds.filter(Boolean))]
  if (!ids.length) return map
  const since = new Date(Date.now() - REVENUE_DEVIATION.windowDays * 86400e3).toISOString()
  // メニュー帰属は console 正典と同一（reward_snapshot.menu_id ?? deals.menu_id）＝両経路を取得して重複除去
  const [byCol, bySnap] = await Promise.all([
    admin.from('deals').select('id, menu_id, reward_snapshot, created_at, status, deal_items(revenue)')
      .in('menu_id', ids).in('status', ['confirmed', 'paid']).gte('created_at', since),
    admin.from('deals').select('id, menu_id, reward_snapshot, created_at, status, deal_items(revenue)')
      .in('reward_snapshot->>menu_id', ids).in('status', ['confirmed', 'paid']).gte('created_at', since),
  ])
  const seen = new Set<string>()
  for (const d of [...(byCol.data ?? []), ...(bySnap.data ?? [])] as { id: string; menu_id: string | null; reward_snapshot: { menu_id?: string } | null; created_at: string; deal_items: { revenue: number | null }[] | null }[]) {
    if (seen.has(d.id)) continue
    seen.add(d.id)
    const mid = (d.reward_snapshot?.menu_id ?? d.menu_id) || null
    if (!mid || !ids.includes(mid)) continue
    const rev = (d.deal_items ?? []).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
    if (rev <= 0) continue
    const arr = map.get(mid) ?? []
    arr.push({ dealId: d.id, revenue: rev, at: d.created_at })
    map.set(mid, arr)
  }
  return map
}

/** N==0 用の想定受注額: メニューの fixed 報酬×10（rate/該当なしは null＝判定しない）。 */
export async function estimateFromReward(admin: Db, menuId: string): Promise<number | null> {
  const { data } = await admin.from('menu_rewards').select('reward_type, reward_value, active').eq('menu_id', menuId).eq('active', true).limit(1)
  const r = (data ?? [])[0] as { reward_type?: string; reward_value?: number } | undefined
  if (!r || r.reward_type !== 'fixed' || !Number(r.reward_value)) return null
  return Number(r.reward_value) * 10
}

/** 1案件の乖離判定（supplier PATCH 用・自案件は参照から除外）。 */
export async function flagForDeal(admin: Db, deal: { id: string; menu_id: string | null; revenue: number }): Promise<RevenueFlag | null> {
  if (!deal.menu_id || !deal.revenue) return null
  const peersMap = await loadPeerRevenues(admin, [deal.menu_id])
  const peers = (peersMap.get(deal.menu_id) ?? []).filter(p => p.dealId !== deal.id).map(p => p.revenue)
  const estimate = peers.length ? null : await estimateFromReward(admin, deal.menu_id)
  return judgeDeviation(deal.revenue, peers, estimate)
}
