import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { surfaceFor, cookieNameFor, SURFACE_HEADER, UID_HEADER, type Surface } from './surface'
import { enforceAuthCookiePolicy } from './cookie-guard'

type CookieAdapter = Parameters<typeof createServerClient>[2]['cookies']

/**
 * ★セッション分離の単一の門（サーバ側）。auth cookie を持つ createServerClient は必ずこの関数を通す。
 * surface→cookie名（cookieNameFor）を強制注入するため、呼び出し側が cookie 名前空間を取り違えられない。
 * （@supabase/ssr の createServerClient 直接importは eslint で lib/supabase/** と proxy.ts に限定＝新規パスがバイパス不可）。
 * cookieAdapter は文脈依存（Server Component=read-only cookies / Route Handler=書込可）なので呼び出し側が渡す。
 */
export function makeSurfaceServerClient(surface: Surface, cookieAdapter: CookieAdapter) {
  // 根絶第1層（2026-07-11）: setAll を許可表ガードでラップ＝面違いの auth cookie 書込を通信層で剥奪（cookie-guard.ts）。
  const guarded: CookieAdapter = {
    getAll: () => cookieAdapter.getAll(),
    setAll: (cookiesToSet, responseHeaders) => cookieAdapter.setAll?.(enforceAuthCookiePolicy(surface, cookiesToSet as never) as never, responseHeaders),
  }
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: { name: cookieNameFor(surface) }, cookies: guarded }
  )
}

/** host+pathname から surface を解決（Route Handler 用の薄いre-export）。 */
export function surfaceOf(host: string | null | undefined, pathname: string | null | undefined): Surface {
  return surfaceFor(host, pathname)
}

export async function createClient() {
  const cookieStore = await cookies()
  const hdrs = await headers()
  // middleware が注入した x-mb-surface を優先。無い場合は host から推定（fallback）。
  const surface = (hdrs.get(SURFACE_HEADER) as Surface | null) ?? surfaceFor(hdrs.get('host'), '/')

  return makeSurfaceServerClient(surface, {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        )
      } catch {
        // Server Component context: cookies are read-only
      }
    },
  })
}

/**
 * ログイン Server Action 専用。
 * 呼び出し面を固定値で照合し、proxy が伝播した surface と異なる cookie 名前空間には書き込ませない。
 * proxy 外の診断環境では host+既知pathnameを surfaceFor に渡すが、クライアント入力は判定に使わない。
 */
export async function createSurfaceActionClient(expectedSurface: Surface, pathname: string) {
  const cookieStore = await cookies()
  const hdrs = await headers()
  const headerSurface = hdrs.get(SURFACE_HEADER)
  const surface = headerSurface === 'app' || headerSurface === 'vendor' || headerSurface === 'console'
    ? headerSurface
    : surfaceFor(hdrs.get('host'), pathname)

  if (surface !== expectedSurface) {
    throw new Error(`Login surface mismatch: expected=${expectedSurface} actual=${surface}`)
  }

  return makeSurfaceServerClient(surface, {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) =>
        cookieStore.set(name, value, options)
      )
    },
  })
}

// Deduplicated per-request: layout + page share one auth round-trip
export const getCachedUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

// 入口の user.id 解決：proxy が検証済み uid を信頼ヘッダ(x-mb-uid)で伝播していれば Auth往復を省く。
// proxy は受信時にクライアント由来の x-mb-uid を delete 済＝偽装不可。呼び出し元は全て matcher ルート（proxy が必ず走る）。
// ヘッダ無し（API 等 proxy が uid を set しない文脈）は従来どおり getUser で検証（フォールバック）。
// ★認証の検証方式は変更しない（実検証は proxy 側の getUser）。id しか使わない入口専用。
export const getCachedUid = cache(async (): Promise<string | null> => {
  const uid = (await headers()).get(UID_HEADER)
  if (uid) return uid
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
})

// Deduplicated per-request: layout + page + resolveVendor が同一行の profiles 読取を共有（RLSは無改修）。
// anon クライアント（本人セッション・RLS適用）で自分の profiles を1回だけ取得。取得列・値は従来と同一。
export const getCachedProfile = cache(async () => {
  const uid = await getCachedUid()
  if (!uid) return null
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('name, role, color, avatar_url').eq('id', uid).single()
  return data as { name: string | null; role: string | null; color: string | null; avatar_url: string | null } | null
})

export async function createServiceRoleClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
