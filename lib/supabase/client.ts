import { createBrowserClient } from '@supabase/ssr'
import { surfaceFor, cookieNameFor, type Surface } from './surface'
import { enforceAuthCookiePolicy, type CookieWrite } from './cookie-guard'

// ブラウザ側もサーフェス別 cookie 名前空間を使う（ログイン/ログアウトは当該サイトのみに作用）。
// ★セッション奪い合い修正：@supabase/ssr の createBrowserClient は isSingleton 未指定だとモジュール全体で
//   単一クライアントをキャッシュし、最初に生成された surface の storageKey を使い回す。→ 同一オリジンで
//   app↔vendor を行き来すると、後からログインした側が別 surface の cookie 名で書き込み、片方が保てない。
//   対策：isSingleton:false でライブラリのグローバル単一化を無効化し、surface 名でクライアントを memo 化する
//   （＝各 surface が必ず自分の storageKey/cookie を使う。同一 surface 内では従来どおり単一クライアント）。
// ★根絶第1層（2026-07-11）：cookie 書込を自前 setAll に通し、許可表（面×cookie名）で検閲＝
//   面違いの auth cookie 書込は剥奪・Domain属性は host-only へ強制（cookie-guard.ts）。
const clientBySurface: Record<string, ReturnType<typeof createBrowserClient>> = {}

function readAllCookies(): { name: string; value: string }[] {
  if (typeof document === 'undefined') return []
  return document.cookie.split('; ').filter(Boolean).map((p) => {
    const i = p.indexOf('=')
    return { name: decodeURIComponent(p.slice(0, i)), value: decodeURIComponent(p.slice(i + 1)) }
  })
}

function writeCookie(w: CookieWrite): void {
  if (typeof document === 'undefined') return
  const o = (w.options ?? {}) as { path?: string; maxAge?: number; expires?: Date | string; sameSite?: string; secure?: boolean }
  let s = `${encodeURIComponent(w.name)}=${encodeURIComponent(w.value)}`
  s += `; Path=${o.path ?? '/'}`
  if (o.maxAge != null) s += `; Max-Age=${o.maxAge}`
  if (o.expires) s += `; Expires=${new Date(o.expires).toUTCString()}`
  s += `; SameSite=${o.sameSite ?? 'Lax'}`
  if (o.secure ?? window.location.protocol === 'https:') s += '; Secure'
  // ★Domain は書かない＝host-only 強制（guard で剥奪済みだが二重に保証）。
  document.cookie = s
}

export function createClient() {
  const surface: Surface = typeof window !== 'undefined'
    ? surfaceFor(window.location.host, window.location.pathname)
    : 'app'
  const name = cookieNameFor(surface)
  const cached = clientBySurface[name]
  if (cached) return cached
  const c = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name },
      isSingleton: false,
      cookies: {
        getAll: () => readAllCookies(),
        setAll: (writes) => { for (const w of enforceAuthCookiePolicy(surface, writes as CookieWrite[])) writeCookie(w) },
      },
    }
  )
  clientBySurface[name] = c
  return c
}
