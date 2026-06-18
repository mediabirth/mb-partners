/**
 * 案件明細化 Batch L2: 明細(deal_items)から案件報酬を集約する純関数。
 *
 * 設計の肝（回帰ゼロ保証）:
 * - 単一明細dealの確定は従来の deals 単位ロジックと1円単位で一致する（確定処理側で単一明細は legacy 計算をそのまま使い、明細は同期するだけ）。
 * - 本モジュールは「複数明細」および「コンソール明細編集の見積もり再計算」で使う。
 * - 明細1件の報酬:
 *     menu なし（手動明細）        → reward = item.amount（作成時の固定額をそのまま）
 *     menu あり・effectiveKind の type=fixed → reward = メニューの固定値（coop_value or ref_value）
 *     menu あり・type=rate          → reward = round(item.base_amount × rate% / 100)
 * - effectiveKind は案件単位（協力ゲートの結果 cooperation|referral）。全明細の rate 参照に適用。
 */

export type RewardItem = {
  id?: string
  service_id: string | null
  menu_id: string | null
  kind?: string | null
  amount: number
  base_amount: number | null
}

export type MenuTerms = {
  coop_enabled?: boolean | null; coop_type?: string | null; coop_value?: number | null; coop_base?: string | null
  ref_type?: string | null; ref_value?: number | null; ref_base?: string | null
} | null | undefined

/** effectiveKind とメニューから採用レートを決定（confirm の deal 単位ロジックと同一規則）。 */
export function itemTerms(effectiveKind: string, menu: MenuTerms): { type: 'fixed' | 'rate'; value: number; base: string } {
  if ((effectiveKind === 'cooperation' || effectiveKind === 'frontier') && menu?.coop_enabled) {
    return { type: (menu.coop_type ?? 'rate') === 'fixed' ? 'fixed' : 'rate', value: Number(menu.coop_value ?? 0), base: menu.coop_base ?? '売上' }
  }
  return { type: (menu?.ref_type ?? 'fixed') === 'rate' ? 'rate' : 'fixed', value: Number(menu?.ref_value ?? 0), base: menu?.ref_base ?? '売上' }
}

export type ItemBreakdown = {
  id?: string; service_id: string | null; menu_id: string | null
  kind: 'fixed' | 'rate'; rate: number | null; base_amount: number | null; reward: number
}

/**
 * 明細の合算で報酬を算出。close_month_batch が読む deals.amount にセットする値の元。
 * needsBaseItem: 率明細で base 未入力があるか（confirm時は base 入力を要求）。
 */
export function computeDealReward(
  items: RewardItem[],
  effectiveKind: string,
  menusById: Record<string, MenuTerms>,
): { total: number; baseTotal: number; breakdown: ItemBreakdown[]; needsBaseItem: boolean } {
  let total = 0
  let baseTotal = 0
  let needsBaseItem = false
  const breakdown: ItemBreakdown[] = []
  for (const it of items) {
    const menu = it.menu_id ? menusById[it.menu_id] : null
    let reward: number
    let kind: 'fixed' | 'rate'
    let rate: number | null = null
    if (!menu) {
      // 手動明細（menuなし）：作成時の固定額をそのまま使う
      kind = 'fixed'
      reward = Math.round(it.amount ?? 0)
    } else {
      const t = itemTerms(effectiveKind, menu)
      if (t.type === 'fixed') {
        kind = 'fixed'
        reward = t.value
      } else {
        kind = 'rate'
        rate = t.value
        if (it.base_amount == null) needsBaseItem = true
        reward = Math.round((it.base_amount ?? 0) * t.value / 100)
        baseTotal += it.base_amount ?? 0
      }
    }
    total += reward
    breakdown.push({ id: it.id, service_id: it.service_id, menu_id: it.menu_id, kind, rate, base_amount: it.base_amount ?? null, reward })
  }
  return { total, baseTotal, breakdown, needsBaseItem }
}
