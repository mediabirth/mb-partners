import { createServerClient } from '@supabase/ssr'
import { cookies, headers } from 'next/headers'
import { cache } from 'react'
import { surfaceFor, cookieNameFor, SURFACE_HEADER, type Surface } from './surface'

export async function createClient() {
  const cookieStore = await cookies()
  const hdrs = await headers()
  // middleware が注入した x-mb-surface を優先。無い場合は host から推定（fallback）。
  const surface = (hdrs.get(SURFACE_HEADER) as Surface | null) ?? surfaceFor(hdrs.get('host'), '/')
  const name = cookieNameFor(surface)

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name },
      cookies: {
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
      },
    }
  )
}

// Deduplicated per-request: layout + page share one auth round-trip
export const getCachedUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

// Deduplicated per-request: layout + page + resolveVendor が同一行の profiles 読取を共有（RLSは無改修）。
// anon クライアント（本人セッション・RLS適用）で自分の profiles を1回だけ取得。取得列・値は従来と同一。
export const getCachedProfile = cache(async () => {
  const user = await getCachedUser()
  if (!user) return null
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('name, role, color').eq('id', user.id).single()
  return data as { name: string | null; role: string | null; color: string | null } | null
})

export async function createServiceRoleClient() {
  const { createClient } = await import('@supabase/supabase-js')
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
