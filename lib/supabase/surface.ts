/**
 * 3サーフェス（console / partner-app / vendor）のセッション分離。
 * 各サーフェスは別々の Supabase 認証 cookie 名前空間を使い、同一ブラウザでも互いに上書きしない。
 *   console → mb-auth-console（別ホスト console.mb-partners.app）
 *   app     → mb-auth-app    （mb-partners.app の partner 画面）
 *   vendor  → mb-auth-vendor （mb-partners.app/vendor）
 * host（console サブドメイン）と path（/console・/vendor・/api/...）の両方で判定する。
 * cookie は host-only（domain 未指定）＝サブドメイン間でも共有しない。
 */
export type Surface = 'console' | 'app' | 'vendor'

export const SURFACE_HEADER = 'x-mb-surface'

// proxy(middleware) が getUser で検証済みの user.id を下流へ伝播する信頼ヘッダ。
// proxy は受信時にクライアント由来の同名ヘッダを必ず delete してから検証済み値を set する（偽装不可）。
export const UID_HEADER = 'x-mb-uid'

export function surfaceFor(host: string | null | undefined, pathname: string | null | undefined): Surface {
  const h = (host ?? '').toLowerCase()
  if (h.startsWith('console.')) return 'console'
  const p = pathname || '/'
  if (p === '/console' || p.startsWith('/console/') || p.startsWith('/api/console')) return 'console'
  if (p === '/vendor' || p.startsWith('/vendor/') || p.startsWith('/api/vendor')) return 'vendor'
  return 'app'
}

export function cookieNameFor(s: Surface): string {
  return s === 'console' ? 'mb-auth-console' : s === 'vendor' ? 'mb-auth-vendor' : 'mb-auth-app'
}
