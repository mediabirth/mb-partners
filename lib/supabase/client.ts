import { createBrowserClient } from '@supabase/ssr'
import { surfaceFor, cookieNameFor } from './surface'

// ブラウザ側もサーフェス別 cookie 名前空間を使う（ログイン/ログアウトは当該サイトのみに作用）。
export function createClient() {
  const name = typeof window !== 'undefined'
    ? cookieNameFor(surfaceFor(window.location.host, window.location.pathname))
    : 'mb-auth-app'
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name } }
  )
}
