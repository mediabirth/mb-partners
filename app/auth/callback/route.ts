import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { makeSurfaceServerClient, surfaceOf } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code  = searchParams.get('code')
  const next  = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const cookieStore = await cookies()
  // partner マジックリンクのコールバック＝host+path から surface を解決し、その専用 cookie に書き込む（中央の門を通す）。
  const surface = surfaceOf(request.headers.get('host'), new URL(request.url).pathname)
  const supabase = makeSurfaceServerClient(surface, {
    getAll:  () => cookieStore.getAll(),
    setAll:  (list) => list.forEach(({ name, value, options }) =>
      cookieStore.set(name, value, options)
    ),
  })

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=auth_failed`)
  }

  // ロールを取得してリダイレクト先を決定
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(`${origin}/login?error=no_user`)
  }

  // service_role で profiles を参照（RLSポリシー未整備のため）
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = profile?.role ?? 'partner'
  const redirectTo = role === 'partner' ? '/app' : '/console'

  if (next && next.startsWith('/')) {
    return NextResponse.redirect(`${origin}${next}`)
  }
  return NextResponse.redirect(`${origin}${redirectTo}`)
}
