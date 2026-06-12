import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // レスポンスを準備（クッキー更新のため）
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // セッション取得（クッキーを更新するために必要）
  const { data: { user } } = await supabase.auth.getUser()

  /* ---- /app/** ガード ---- */
  if (pathname.startsWith('/app')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    // ロールチェック（partner のみ許可）
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile && profile.role !== 'partner') {
      return NextResponse.redirect(new URL('/console', request.url))
    }
    return response
  }

  /* ---- /console/** ガード ---- */
  if (pathname.startsWith('/console') && !pathname.startsWith('/console/login')) {
    if (!user) {
      return NextResponse.redirect(new URL('/console/login', request.url))
    }
    // ロールチェック（owner/manager/staff のみ許可）
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role === 'partner') {
      return NextResponse.redirect(new URL('/app', request.url))
    }
    // AAL2（TOTP確認）チェック
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const hasTOTP = (factors?.totp?.length ?? 0) > 0
    if (hasTOTP && aal?.currentLevel !== 'aal2') {
      return NextResponse.redirect(new URL('/console/login', request.url))
    }
    return response
  }

  /* ---- ログイン済みでログインページにアクセスした場合 ---- */
  if (pathname === '/login' && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    return NextResponse.redirect(new URL(
      profile?.role === 'partner' ? '/app' : '/console',
      request.url
    ))
  }
  if (pathname === '/console/login' && user) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') {
      return NextResponse.redirect(new URL('/console', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/app/:path*',
    '/console/:path*',
    '/login',
  ],
}
