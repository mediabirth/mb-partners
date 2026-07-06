/**
 * Wave3-③A：価値ベースのティア（★認知のみ・read-only の派生値）。
 * 確定成約数(confirmed/paid の件数)から段階を“分類して見せるだけ”。
 * ★reward率・報酬計算・お金・payout には一切結びつけない（ティアで報酬は変わらない）。
 * しきい値は調整可（v1初期値）。
 */
export type TierInfo = {
  key: string
  label: string
  color: string
  bg: string
  nextLabel: string | null
  nextMin: number | null
  remaining: number // 次ティアまであと何成約（最上位なら0）
}

const TIERS = [
  { key: 'bronze', label: 'ブロンズ', min: 0, color: '#9C6B3F', bg: '#F3EAE0' },
  { key: 'silver', label: 'シルバー', min: 3, color: '#6E7681', bg: '#EDEFF2' },
  { key: 'gold', label: 'ゴールド', min: 10, color: '#B8860B', bg: '#FBF1D9' },
  { key: 'platinum', label: 'プラチナ', min: 25, color: '#4733E6', bg: '#ECE6DA' },
]

export const TIER_THRESHOLDS = TIERS.map(t => ({ label: t.label, min: t.min }))

/** 確定成約数からティアを算出（read-only・お金非接触）。 */
export function partnerTier(wonCount: number): TierInfo {
  const n = Math.max(0, Math.floor(wonCount || 0))
  let idx = 0
  for (let i = 0; i < TIERS.length; i++) if (n >= TIERS[i].min) idx = i
  const cur = TIERS[idx]
  const next = TIERS[idx + 1] ?? null
  return {
    key: cur.key, label: cur.label, color: cur.color, bg: cur.bg,
    nextLabel: next?.label ?? null, nextMin: next?.min ?? null,
    remaining: next ? Math.max(0, next.min - n) : 0,
  }
}
