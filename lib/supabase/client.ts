import { createBrowserClient } from '@supabase/ssr'
import { surfaceFor, cookieNameFor } from './surface'

// ブラウザ側もサーフェス別 cookie 名前空間を使う（ログイン/ログアウトは当該サイトのみに作用）。
// ★セッション奪い合い修正：@supabase/ssr の createBrowserClient は isSingleton 未指定だとモジュール全体で
//   単一クライアントをキャッシュし、最初に生成された surface の storageKey を使い回す。→ 同一オリジンで
//   app↔vendor を行き来すると、後からログインした側が別 surface の cookie 名で書き込み、片方が保てない。
//   対策：isSingleton:false でライブラリのグローバル単一化を無効化し、surface 名でクライアントを memo 化する
//   （＝各 surface が必ず自分の storageKey/cookie を使う。同一 surface 内では従来どおり単一クライアント）。
const clientBySurface: Record<string, ReturnType<typeof createBrowserClient>> = {}

export function createClient() {
  const name = typeof window !== 'undefined'
    ? cookieNameFor(surfaceFor(window.location.host, window.location.pathname))
    : 'mb-auth-app'
  const cached = clientBySurface[name]
  if (cached) return cached
  const c = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name }, isSingleton: false }
  )
  clientBySurface[name] = c
  return c
}
