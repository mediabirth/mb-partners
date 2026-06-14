/**
 * Next.js proxy (= middleware) — Supabase SSR cookie refresh + route protection
 *
 * Design goals:
 * - Verified auth check via getUser() — tamper-proof, no JWT spoofing
 * - Cookie refresh on every response (critical for token expiry handling)
 * - Layout server components deduplicate their own getUser() via React cache()
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

  // getUser() makes a verified round-trip to Supabase Auth — tamper-proof.
  // Cookie refresh (via setAll above) happens regardless of which method we call.
  // Layout server components also call getCachedUser() which is deduplicated via
  // React cache(), so the total per protected page is 2 getUser() calls (proxy + layout).
  const { data: { user } } = await supabase.auth.getUser()

  // ── /app/** — partner portal ────────────────────────────────────────────────
  if (pathname.startsWith('/app')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  // ── /console/** — admin console ────────────────────────────────────────────
  if (pathname.startsWith('/console') && !pathname.startsWith('/console/login')) {
    if (!user) {
      return NextResponse.redirect(new URL('/console/login', request.url))
    }
    return response
  }

  // ── Already-logged-in: redirect away from login pages ─────────────────────
  if (pathname === '/login' && user) {
    // Send to root — root page reads profile.role and routes to /app or /console.
    // Redirecting directly to /app here would loop for admins who have no partner record.
    return NextResponse.redirect(new URL('/', request.url))
  }
  if (pathname === '/console/login' && user) {
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
