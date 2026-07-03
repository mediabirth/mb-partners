/**
 * 銀行・支店マスタ（全銀協データ / zengin-code 由来を banks / bank_branches に保持）検索ヘルパ。
 * 外部APIに依存せず、更新はCSV再取込みで保守する（docs/reports/integrity_banks_master_ddl.sql 参照）。
 * マスタの銀行名は「銀行」抜き・英字は全角（例: ＰａｙＰａｙ）。表示名はUI側で「◯◯銀行」を付ける。
 */

// 検索語の正規化: カタカナ→ひらがな、半角英数→全角（マスタ表記へ寄せる）
export function normalizeBankQuery(q: string): { raw: string; hira: string; zen: string } {
  const raw = q.trim()
  const hira = raw.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  const zen = raw.replace(/[A-Za-z0-9]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xfee0))
  return { raw, hira, zen }
}

/** 主要行（検索語が空のときの初期候補）。コードは全銀協固定。 */
export const MAJOR_BANK_CODES = ['0001', '0005', '0009', '0010', '9900', '0036', '0038', '0033', '0040', '0310']

export type BankRow = { code: string; name: string; kana: string | null; hira: string | null }
export type BranchRow = { bank_code: string; code: string; name: string; kana: string | null; hira: string | null }

/** ゆうちょ(9900)など一部を除き、表示は「◯◯銀行」。信金・信組・農協等は名称に含まれるためそのまま。 */
export function bankDisplayName(name: string): string {
  if (/(銀行|信用金庫|信用組合|農協|漁協|労働金庫|信連|信漁連|支店)$/.test(name)) return name
  if (/(信金|信組|金庫|組合|農業|漁業)/.test(name)) return name
  return `${name}銀行`
}
