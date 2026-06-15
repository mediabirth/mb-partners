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

/** 敬称付き表示。個人=「氏名 様」 / 法人=「会社名 御中　担当者名 様」 */
export function customerHonorific(d: CustomerLike): string {
  if (isCorporate(d)) {
    const co = d.company_name || d.customer_name || ''
    const person = d.contact_name
    if (!co) return person ? `${person} 様` : ''
    return person ? `${co} 御中　${person} 様` : `${co} 御中`
  }
  const nm = d.customer_name || d.contact_name || ''
  return nm ? `${nm} 様` : ''
}

/** 敬称なしのプレーン表示（アバター頭文字など用） */
export function customerPlain(d: CustomerLike): string {
  if (isCorporate(d)) return d.company_name || d.customer_name || ''
  return d.customer_name || d.contact_name || ''
}
