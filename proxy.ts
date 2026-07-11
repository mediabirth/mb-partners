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
  requestHeaders.set('x-mb-path', pathname)   // 下流(layout)の戻り先付与用・表示専用。認証判定には不使用。
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
    // 招待動線修理（2026-07-11）: パートナー向け受諾/公開パスは console ホストで開かせない（apexへ強制）。
    // console ホストで /invite を開くと signIn cookie が mb-auth-console に書かれ APP セッションが成立しない
    // （完了CTA→/app がログインへ落ちる）。member/accept（運営メンバー招待）のみ console 所属として残す。
    if (pathname.startsWith('/invite') || pathname.startsWith('/partners') || pathname.startsWith('/join') || pathname.startsWith('/r/')) return xApp(pathname)
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

  // バッチ2：毎リクエストの getUser（Supabase Auth への往復）を getClaims（ローカルJWT検証）へ。
  // getClaims は内部で getSession を呼ぶ＝期限切れ時は refresh_token で更新し SSR setAll で cookie を書き戻す
  // （リフレッシュ機構は維持）。検証は ES256/JWKS を crypto.subtle でローカル署名検証＝毎リクエストの往復なし。
  // 期限切れ/不正トークンは getClaims が弾き claims=null → 未ログイン扱いで既存ログインへ redirect（挙動不変）。
  const { data: claimsRes } = await supabase.auth.getClaims()
  const claims = (claimsRes?.claims ?? null) as { sub?: string; app_metadata?: { role?: string } } | null
  const uid = claims?.sub ?? null
  // 検証済み uid を信頼ヘッダで下流へ伝播（spoofing対策＝受信時の x-mb-uid strip は上で実施済）。
  if (uid) {
    requestHeaders.set(UID_HEADER, uid)
    const carried = response.cookies.getAll()
    response = NextResponse.next({ request: { headers: requestHeaders } })
    carried.forEach((c) => response.cookies.set(c))
  }
  // role は JWT/app_metadata クレームから（claims 内）。無ければ profiles 参照へ（従来と同一）。
  async function roleOf(): Promise<string | null> {
    if (!uid) return null
    const claimRole = claims?.app_metadata?.role
    if (claimRole) return claimRole
    const { data } = await supabase.from('profiles').select('role').eq('id', uid).single()
    return data?.role ?? null
  }

  // ── /app/** — partner portal ────────────────────────────────────────────────
  if (pathname.startsWith('/app')) {
    // 認証判定は不変。弾いた後の行き先にだけ戻り先 pathname を付与（ログイン後に目的ページへ復帰）。
    if (!uid) return NextResponse.redirect(new URL('/login?redirect=' + encodeURIComponent(pathname), request.url))
    const role = await roleOf()
    if (role && role !== 'partner') {
      return isAppHost ? xConsole('/console') : NextResponse.redirect(new URL('/console', request.url))
    }
    return response
  }

  // ── /console/** — admin console ────────────────────────────────────────────
  if (pathname.startsWith('/console') && !pathname.startsWith('/console/login')) {
    if (!uid) return NextResponse.redirect(new URL('/console/login', request.url))
    const role = await roleOf()
    if (role === 'partner') {
      return isConsoleHost ? xApp('/app') : NextResponse.redirect(new URL('/app', request.url))
    }
    return response
  }

  // ── /vendor/** — vendor ポータル（ページ側でも role 検証。ここでは未ログインを login へ）──
  if (pathname.startsWith('/vendor') && !pathname.startsWith('/vendor/login') && !pathname.startsWith('/vendor/accept')) {
    if (!uid) return NextResponse.redirect(new URL('/vendor/login', request.url))
    return response
  }

  // ── Already-logged-in: redirect away from login pages ─────────────────────
  if (pathname === '/login' && uid) {
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
    // 招待動線修理（2026-07-11）: console ホスト封じ込めのため受諾/公開パスも proxy を通す。
    '/invite/:path*',
    '/partners/:path*',
    '/join',
    '/r/:path*',
  ],
}
