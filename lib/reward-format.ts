/**
 * 報酬の表示記法（★menu_rewards の値・計算には一切触れない・表示整形のみ）。
 * APP（refer 3画面）と コンソール（サービスマスタ）で同一記法を共有する。
 */
export type RewardLike = {
  reward_type: 'fixed' | 'rate' | 'continuous'
  reward_value: number | string
  default_months?: number | null
}

/** 単一報酬の値記法。fixed=¥、rate=粗利のX%、continuous=継続 粗利X%/月（months指定で・Yヶ月）。 */
export function rewardValueText(r: RewardLike, opts?: { months?: boolean }): string {
  const v = Number(r.reward_value)
  if (r.reward_type === 'fixed') return `¥${v.toLocaleString()}`
  if (r.reward_type === 'continuous') return `継続 粗利${v}%/月${opts?.months && r.default_months ? `・${r.default_months}ヶ月` : ''}`
  return `粗利の${v}%`
}

/** 「報酬 ¥30,000」等の統一ピル文言（単一報酬・APP用）。 */
export function rewardPillText(r: RewardLike): string {
  return `報酬 ${rewardValueText(r)}`
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
