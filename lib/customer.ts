// 顧客属性（個人/法人）と敬称付き表示の単一ソース（⑦⑧）
export type CustomerLike = {
  customer_type?: string | null
  company_name?: string | null
  contact_name?: string | null
  customer_name?: string | null
}

export function isCorporate(d: CustomerLike): boolean {
  return d.customer_type === 'corporate' || (!d.customer_type && !!d.company_name)
}

/** 敬称付き表示。個人=「氏名 様」 / 法人=「法人名 様」に固定（整合性プログラムC:
 *  案件カード・詳細は法人名を担当者名より優先。担当者名は表示しない＝迷いのない一意表記）。 */
export function customerHonorific(d: CustomerLike): string {
  if (isCorporate(d)) {
    const co = d.company_name || d.customer_name || ''
    if (co) return `${co} 様`
    const person = d.contact_name
    return person ? `${person} 様` : ''
  }
  const nm = d.customer_name || d.contact_name || ''
  return nm ? `${nm} 様` : ''
}

/** 敬称なしのプレーン表示（アバター頭文字など用） */
export function customerPlain(d: CustomerLike): string {
  if (isCorporate(d)) return d.company_name || d.customer_name || ''
  return d.customer_name || d.contact_name || ''
}
