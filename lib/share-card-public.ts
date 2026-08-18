export const SHARE_CARD_APEX = 'https://mb-partners.app'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MONEY_RE = /(?:[¥￥$€£]\s?\d|報酬|手数料|委託費|受注額|支払額|粗利|\d[\d,.]*\s*(?:円|%|％))/u

export function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function safePublicDescription(value: string | null | undefined, name: string): string {
  const text = value?.trim() ?? ''
  const safe = text && !MONEY_RE.test(text) ? text : `${name}についてのご相談を承ります`
  const chars = Array.from(safe)
  return chars.length > 90 ? `${chars.slice(0, 89).join('')}…` : safe
}

export function makeShareUrl(token: string, menuId?: string | null): string {
  const url = new URL(`/r/${encodeURIComponent(token)}`, SHARE_CARD_APEX)
  if (validUuid(menuId)) url.searchParams.set('m', menuId)
  url.searchParams.set('src', 'card')
  return url.toString()
}

export function makeShareMessage(input: {
  serviceName: string
  menuName?: string | null
  publicDescription?: string | null
  url: string
}): string {
  const subject = input.menuName?.trim() || input.serviceName.trim()
  const description = safePublicDescription(input.publicDescription, subject)
  return `「${subject}」について、よろしければご覧ください。\n${description}\n${input.url}`
}
