/**
 * 金額/数値の安全パース。フォーム入力（カンマ・全角数字・¥/円/%・空白）を許容して数値化する。
 * ★これは「入力文字列→数値」の取り込みのみ。reward 計算式 base×value/100 には一切触れない。
 *
 * 不具合: 固定報酬「30,000」を Number("30,000") で読むと NaN→0 になり ¥0 保存される
 * （率「50」はカンマ無しで通るため固定だけ0になる）。本パーサで恒久的に塞ぐ。
 */
const FULLWIDTH = '０１２３４５６７８９'

export function parseAmount(input: unknown): number {
  if (typeof input === 'number') return Number.isFinite(input) ? input : 0
  if (input == null) return 0
  // 全角数字→半角、桁区切り/通貨記号/%/空白を除去してから数値化
  const half = String(input).replace(/[０-９]/g, d => String(FULLWIDTH.indexOf(d)))
  const cleaned = half.replace(/[,　\s¥￥円%％]/g, '')
  if (cleaned === '' || cleaned === '-') return 0
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : 0
}
