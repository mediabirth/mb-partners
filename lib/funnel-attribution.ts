import { validUuid } from '@/lib/share-card-public'

const VALID_SOURCES = new Set(['digest', 'card'])

export function normalizeFunnelAttribution(src: unknown, menuId: unknown): {
  src: 'digest' | 'card' | null
  menuId: string | null
} {
  return {
    src: typeof src === 'string' && VALID_SOURCES.has(src) ? src as 'digest' | 'card' : null,
    menuId: validUuid(menuId) ? menuId : null,
  }
}

export function makeFunnelDedupHash(
  eventType: string,
  token: string | null,
  channel: string | null,
  src: 'digest' | 'card' | null,
  menuId: string | null,
): string {
  const legacy = `${eventType}:${token ?? ''}:${channel ?? ''}`
  return src || menuId ? `${legacy}:${src ?? ''}:${menuId ?? ''}` : legacy
}
