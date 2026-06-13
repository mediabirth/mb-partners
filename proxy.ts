/**
 * Next.js proxy (= middleware) — Supabase SSR cookie refresh + route protection
 *
 * Design goals:
 * - Zero extra HTTP round-trips per request (use getSession() for redirect logic)
 * - Cookie refresh on every response (critical for token expiry handling)
 * - Actual security enforcement (getUser) stays in layout server components
 * - TOTP AAL2 enforcement stays in console/login page and console layout
 */
import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

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

  // getSession() decodes the JWT locally — no Supabase network round-trip.
  // The act of creating the client + calling getSession() triggers cookie refresh
  // if the token is close to expiry. Actual user verification (getUser) is in layouts.
  const { data: { session } } = await supabase.auth.getSession()

  // ── /app/** — partner portal ────────────────────────────────────────────────
  if (pathname.startsWith('/app')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  // ── /console/** — admin console ────────────────────────────────────────────
  if (pathname.startsWith('/console') && !pathname.startsWith('/console/login')) {
    if (!session) {
      return NextResponse.redirect(new URL('/console/login', request.url))
    }
    return response
  }

  // ── Already-logged-in: redirect away from login pages ─────────────────────
  if (pathname === '/login' && session) {
    return NextResponse.redirect(new URL('/app', request.url))
  }
  if (pathname === '/console/login' && session) {
    // Only redirect if AAL2 is satisfied (check the session aal)
    // session.aal is present for MFA-enrolled users; if aal2 already met → /console
    const aal = (session as any).aal as string | undefined
    if (aal === 'aal2' || !aal) {
      // Non-MFA session or already at aal2: let the console/login page decide
      // (it checks mfa.getAuthenticatorAssuranceLevel itself)
    }
    // Don't redirect away from /console/login here — the page handles it via
    // router.push after TOTP verify. This prevents redirect loops.
  }

  return response
}

export const config = {
  matcher: [
    '/app/:path*',
    '/console/:path*',
    '/login',
    '/console/login',
  ],
}
