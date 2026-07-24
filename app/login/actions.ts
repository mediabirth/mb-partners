'use server'

import { createSurfaceActionClient } from '@/lib/supabase/server'
import type { Surface } from '@/lib/supabase/surface'

export type LoginResult = { ok: boolean }

async function signIn(
  surface: Surface,
  pathname: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  try {
    const supabase = await createSurfaceActionClient(surface, pathname)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { ok: !error }
  } catch {
    return { ok: false }
  }
}

export async function signInApp(email: string, password: string): Promise<LoginResult> {
  return signIn('app', '/login', email.trim().toLowerCase(), password)
}

export async function signInVendor(email: string, password: string): Promise<LoginResult> {
  return signIn('vendor', '/vendor/login', email.trim().toLowerCase(), password)
}

export async function signInConsole(email: string, password: string): Promise<LoginResult> {
  return signIn('console', '/console/login', email, password)
}
