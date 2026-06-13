/**
 * Supabase SSR middleware — cookie refresh + route protection
 *
 * Critical: This must run on every request to refresh the auth token stored
 * in cookies. Without it, tokens expire and server components can't read the
 * session, even if the user just logged in.
 *
 * Pattern: https://supabase.com/docs/guides/auth/server-side/nextjs
 */
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Start with a passthrough response so we can attach refreshed cookies
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // Write refreshed cookies both to the mutated request (for downstream
          // middleware) and to the response (so the browser stores them).
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() decodes the JWT locally — no Supabase round-trip, fast.
  // The actual security check (getUser) happens in layout/page server components.
  // The primary purpose here is cookie refresh + redirect UX.
  const { data: { session } } = await supabase.auth.getSession()
  const path = request.nextUrl.pathname

  // ── /app/* — partner portal ────────────────────────────────────────────────
  if (path.startsWith('/app') && !session) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── /console/* — admin console ────────────────────────────────────────────
  if (
    path.startsWith('/console') &&
    !path.startsWith('/console/login') &&
    !session
  ) {
    const url = request.nextUrl.clone()
    url.pathname = '/console/login'
    return NextResponse.redirect(url)
  }

  // ── Already-logged-in users should not see login pages ────────────────────
  if (path === '/login' && session) {
    const url = request.nextUrl.clone()
    url.pathname = '/app'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static / _next/image (Next.js assets)
     * - favicon.ico, robots.txt, etc.
     * - /api/* (API routes handle their own auth)
     * - static files (svg, png, …)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
