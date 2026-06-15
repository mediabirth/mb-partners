/**
 * Next.js proxy (= middleware) — host separation + Supabase SSR cookie refresh + route protection
 *
 * Host separation:
 *   console.mb-partners.app → 管理コンソール (console only; dedicated /console/login)
 *   mb-partners.app         → パートナーAPP (app only)
 * Combined with role すみ分け: owner/管理 → console, partner → app.
 * Preview/other hosts (*.vercel.app, localhost) fall back to combined single-host behaviour.
 */
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

const APP_HOST = 'mb-partners.app'
const CONSOLE_HOST = 'console.mb-partners.app'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const host = (request.headers.get('host') || '').toLowerCase()
  const isConsoleHost = host === CONSOLE_HOST
  const isAppHost = host === APP_HOST || host === `www.${APP_HOST}`

  const xConsole = (p: string) => NextResponse.redirect(`https://${CONSOLE_HOST}${p}`)
  const xApp = (p: string) => NextResponse.redirect(`https://${APP_HOST}${p}`)

  // ── Host containment (production hosts only) ────────────────────────────────
  if (isConsoleHost) {
    if (pathname === '/') return NextResponse.redirect(new URL('/console', request.url))
    if (pathname === '/login') return NextResponse.redirect(new URL('/console/login', request.url))
    if (pathname.startsWith('/app')) return xApp(pathname)   // app belongs to the apex host
  }
  if (isAppHost) {
    if (pathname.startsWith('/console')) return xConsole(pathname) // console belongs to the subdomain
  }

  // Build a passthrough response; setAll will recreate it with refreshed cookies
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

  const { data: { user } } = await supabase.auth.getUser()
  async function roleOf(): Promise<string | null> {
    if (!user) return null
    const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    return data?.role ?? null
  }

  // ── /app/** — partner portal ────────────────────────────────────────────────
  if (pathname.startsWith('/app')) {
    if (!user) return NextResponse.redirect(new URL('/login', request.url))
    const role = await roleOf()
    if (role && role !== 'partner') {
      // owner/管理 → console (subdomain on prod, same host elsewhere)
      return isAppHost ? xConsole('/console') : NextResponse.redirect(new URL('/console', request.url))
    }
    return response
  }

  // ── /console/** — admin console ────────────────────────────────────────────
  if (pathname.startsWith('/console') && !pathname.startsWith('/console/login')) {
    if (!user) return NextResponse.redirect(new URL('/console/login', request.url))
    const role = await roleOf()
    if (role === 'partner') {
      // partner → app (apex on prod, same host elsewhere)
      return isConsoleHost ? xApp('/app') : NextResponse.redirect(new URL('/app', request.url))
    }
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
    '/login',
    '/console/login',
  ],
}
