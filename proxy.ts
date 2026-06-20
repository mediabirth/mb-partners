/**
 * Next.js proxy (= middleware) — host separation + サーフェス別セッション分離 + route protection
 *
 * Host separation:
 *   console.mb-partners.app → 管理コンソール (console only; dedicated /console/login)
 *   mb-partners.app         → パートナーAPP / vendor ポータル
 *
 * セッション分離（本バッチ）:
 *   console / app / vendor で別々の Supabase 認証 cookie 名前空間を使う（mb-auth-console / -app / -vendor）。
 *   同一ブラウザで3サイト同時ログインしても互いに上書き・ログアウトされない。
 *   x-mb-surface ヘッダを下流（server components / route handlers の createClient）へ伝播し、
 *   各サーフェスが「自分の cookie だけ」を読む。
 */
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'
import { surfaceFor, cookieNameFor, SURFACE_HEADER, UID_HEADER } from '@/lib/supabase/surface'

const APP_HOST = 'mb-partners.app'
const CONSOLE_HOST = 'console.mb-partners.app'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = (request.headers.get('host') || '').toLowerCase()
  const isConsoleHost = host === CONSOLE_HOST
  const isAppHost = host === APP_HOST || host === `www.${APP_HOST}`

  // ── サーフェス判定 + 下流へ伝播 ────────────────────────────────────────────
  const surface = surfaceFor(host, pathname)
  const name = cookieNameFor(surface)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(SURFACE_HEADER, surface)
  // spoofing 防止：クライアント由来の x-mb-uid を必ず除去（後段で検証済み値のみ set する）。
  requestHeaders.delete(UID_HEADER)
  const passthrough = () => NextResponse.next({ request: { headers: requestHeaders } })

  const xConsole = (p: string) => NextResponse.redirect(`https://${CONSOLE_HOST}${p}`)
  const xApp = (p: string) => NextResponse.redirect(`https://${APP_HOST}${p}`)

  // ── Host containment (production hosts only) ────────────────────────────────
  if (isConsoleHost) {
    if (pathname === '/') return NextResponse.redirect(new URL('/console', request.url))
    if (pathname === '/login') return NextResponse.redirect(new URL('/console/login', request.url))
    if (pathname.startsWith('/app') || pathname.startsWith('/vendor')) return xApp(pathname) // apex 所属
  }
  if (isAppHost) {
    if (pathname.startsWith('/console')) return xConsole(pathname) // console belongs to the subdomain
  }

  // ── API: サーフェスヘッダだけ付与（セッション更新は各ハンドラが自分の cookie で実施）──
  if (pathname.startsWith('/api')) return passthrough()

  // Build a passthrough response; setAll will recreate it with refreshed cookies（surface cookie のみ）
  let response = passthrough()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { name },   // ← サーフェス専用 cookie 名前空間
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request: { headers: requestHeaders } })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  // 検証済み user.id を信頼ヘッダで下流へ伝播 → 入口 layout/page は getUser を再実行せず往復を1回に。
  // response を requestHeaders で再構築し、refresh 済 cookie を引き継ぐ（認証の意味＝getUser検証は不変）。
  if (user) {
    requestHeaders.set(UID_HEADER, user.id)
    const carried = response.cookies.getAll()
    response = NextResponse.next({ request: { headers: requestHeaders } })
    carried.forEach((c) => response.cookies.set(c))
  }
  // B2: role を JWT/app_metadata クレームから読む（あればDB問い合わせ不要）。無ければ profiles 参照へ。
  async function roleOf(): Promise<string | null> {
    if (!user) return null
    const claimRole = (user.app_metadata as { role?: string } | undefined)?.role
    if (claimRole) return claimRole
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return data?.role ?? null
  }

  // ── /app/** — partner portal ────────────────────────────────────────────────
  if (pathname.startsWith('/app')) {
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
    const role = await roleOf()
    if (role && role !== 'partner') {
      return isAppHost ? xConsole('/console') : NextResponse.redirect(new URL('/console', request.url))
    }
    return response
  }

  // ── /console/** — admin console ────────────────────────────────────────────
  if (pathname.startsWith('/console') && !pathname.startsWith('/console/login')) {
    if (!user) return NextResponse.redirect(new URL('/console/login', request.url))
    const role = await roleOf()
    if (role === 'partner') {
      return isConsoleHost ? xApp('/app') : NextResponse.redirect(new URL('/app', request.url))
    }
    return response
  }

  // ── /vendor/** — vendor ポータル（ページ側でも role 検証。ここでは未ログインを login へ）──
  if (pathname.startsWith('/vendor') && !pathname.startsWith('/vendor/login') && !pathname.startsWith('/vendor/accept')) {
    if (!user) return NextResponse.redirect(new URL('/vendor/login', request.url))
    return response
  }

  // ── Already-logged-in: redirect away from login pages ─────────────────────
  if (pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/app/:path*',
    '/console/:path*',
    '/vendor/:path*',
    '/login',
    '/console/login',
    '/api/:path*',
  ],
}
