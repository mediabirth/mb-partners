// ============================================================
// 支払スケジュール／源泉計算の単一ソース（APP・コンソール共通）
// 方針: 月末締め・翌月末払い（固定）。源泉は個人のみ 10.21%。
// ============================================================

export const WITHHOLDING_RATE = 0.1021
export const PAYOUT_POLICY_LABEL = '月末締め・翌月末払い'

/**
 * 源泉所得税。個人(individual)のみ gross × 10.21% を控除。
 * 整数演算で算出し、Postgres の ROUND(gross * 0.1021)（四捨五入・half away from zero）
 * と完全一致させる（浮動小数誤差による ¥1 差を排除）。
 * close_month_batch() の v_wh と同一結果になることを保証する。
 */
export function withholdingTax(gross: number, taxType: string | null | undefined): number {
  if (taxType !== 'individual') return 0
  const g = Math.round(gross) // grossは整数前提だが念のため
  // g * 1021 / 10000 を整数で四捨五入（remainder>=5000 で切り上げ）
  const numer = g * 1021
  const q = Math.floor(numer / 10000)
  const rem = numer - q * 10000
  return q + (rem * 2 >= 10000 ? 1 : 0)
}

/** 手取り（gross − 源泉） */
export function netAmount(gross: number, taxType: string | null | undefined): number {
  return gross - withholdingTax(gross, taxType)
}

/**
 * 次回振込日 = 翌月末（月末締め・翌月末払い）。
 * 例: 6月時点 → 7/31。基準日(from)省略時は現在。
 */
export function nextPayoutDate(from: Date = new Date()): Date {
  // new Date(y, m+2, 0) = (from の翌月)の末日
  return new Date(from.getFullYear(), from.getMonth() + 2, 0)
}
