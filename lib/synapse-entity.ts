// SYNAPSE 区分推定＋名寄せ正規化（純粋関数・read-onlyな表示判定のみ・money/帰属に非接触）。
// 台帳(synapse_contacts)と deal由来を 名前/会社 で突合する際の正規化を一元化し、一覧と詳細で同一挙動にする。

// 名寄せキー：空白・全角空白・法人接頭辞を除去して小文字化（詳細ページの norm と同一定義）。
export function synNorm(s: string | null | undefined): string {
  return (s ?? '').replace(/\s|　|株式会社|（株）|\(株\)|有限会社|合同会社/g, '').toLowerCase()
}

// 法人語（会社名に含まれがちな語）。名前から法人/個人を推定するためのヒント。
const CORP_HINT = /(株式会社|合同会社|有限会社|一般社団|公益財団|医療法人|不動産|商事|製作所|事務所|工業|物産|商店|会社|法人|社|店)/

// 区分推定：customer_type を最優先、無ければ会社名の有無＋名前の法人語で推定。
export function inferEntity(
  customerType: string | null | undefined,
  companyName: string | null | undefined,
  personOrCustomerName: string | null | undefined,
): 'individual' | 'corporate' {
  if (customerType === 'corporate') return 'corporate'
  if (customerType === 'individual') return 'individual'
  if (companyName && companyName.trim()) return 'corporate'
  if (personOrCustomerName && CORP_HINT.test(personOrCustomerName)) return 'corporate'
  return 'individual'
}
