/**
 * 報酬の表示記法（★menu_rewards の値・計算には一切触れない・表示整形のみ）。
 * APP（refer 3画面）と コンソール（サービスマスタ）で同一記法を共有する。
 */
export type RewardLike = {
  reward_type: 'fixed' | 'rate' | 'continuous'
  reward_value: number | string
  default_months?: number | null
}

/** 単一報酬の値記法。fixed=¥、rate=粗利(税抜)のX%、continuous=継続 粗利(税抜)X%/月（months指定で・Yヶ月）。
 *  決定①: 報酬の基準は税抜粗利。率報酬は基準を「粗利(税抜)」と明記（金額の税抜は画面側の注記/ラベルで統一）。 */
export function rewardValueText(r: RewardLike, opts?: { months?: boolean }): string {
  const v = Number(r.reward_value)
  if (r.reward_type === 'fixed') return `¥${v.toLocaleString()}`
  if (r.reward_type === 'continuous') return `継続 粗利(税抜)${v}%/月${opts?.months && r.default_months ? `・${r.default_months}ヶ月` : ''}`
  return `粗利(税抜)の${v}%`
}

/** 「報酬 ¥30,000」等の統一ピル文言（単一報酬・APP用）。 */
export function rewardPillText(r: RewardLike): string {
  return `報酬 ${rewardValueText(r)}`
}

// ── Opportunity Board 用 純関数（表示層導出のみ・money/データ非接触・単体テスト対象）──
export type RangeReward = { reward_type: 'fixed' | 'rate' | 'continuous'; reward_value: number | string }
export type RangeMenu = { rewards?: RangeReward[] | null }

/** ブランド内 全報酬から報酬レンジ文字列。fixed優先で¥表記、fixed無しは rate→continuous。0件は null（ピル非表示）。 */
export function rewardRangeLabel(menus: RangeMenu[] | null | undefined): string | null {
  const rewards = (menus ?? []).flatMap(m => m.rewards ?? [])
  if (rewards.length === 0) return null
  const fixedVals = rewards.filter(r => r.reward_type === 'fixed').map(r => Number(r.reward_value || 0)).filter(v => v > 0)
  const rateVals  = rewards.filter(r => r.reward_type === 'rate').map(r => Number(r.reward_value || 0)).filter(v => v > 0)
  const contVals  = rewards.filter(r => r.reward_type === 'continuous').map(r => Number(r.reward_value || 0)).filter(v => v > 0)
  const hasVariable = rateVals.length > 0 || contVals.length > 0
  if (fixedVals.length) {
    const min = Math.min(...fixedVals), max = Math.max(...fixedVals)
    if (hasVariable) return `¥${min.toLocaleString()}〜`
    if (max > min)   return `¥${min.toLocaleString()}〜¥${max.toLocaleString()}`
    return `¥${min.toLocaleString()}`
  }
  if (rateVals.length) {
    const min = Math.min(...rateVals), max = Math.max(...rateVals)
    return max > min ? `粗利(税抜)の${min}%〜${max}%` : `粗利(税抜)の${min}%〜`
  }
  if (contVals.length) {
    const min = Math.min(...contVals), max = Math.max(...contVals)
    return max > min ? `継続 粗利(税抜)${min}%〜${max}%/月` : `継続 粗利(税抜)${min}%/月`
  }
  return null
}

/** メニューの複数報酬を1つの統一ピル文言に（コンソール一覧用）。
 *  fixed/rate は「報酬 A＋B」、continuous は「継続 粗利X%/月・Yヶ月」を併記。 */
export function rewardPillForMenu(rewards: RewardLike[] | null | undefined): string {
  const rs = rewards ?? []
  if (rs.length === 0) return '報酬未設定'
  if (rs.every(r => r.reward_type === 'continuous')) return rs.map(r => rewardValueText(r, { months: true })).join('＋')
  const nonCont = rs.filter(r => r.reward_type !== 'continuous').map(r => rewardValueText(r))
  const cont = rs.filter(r => r.reward_type === 'continuous').map(r => rewardValueText(r, { months: true }))
  const base = nonCont.length ? `報酬 ${nonCont.join('＋')}` : ''
  return [base, ...cont].filter(Boolean).join(' ')
}
