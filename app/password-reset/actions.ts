'use server'

import { createHash } from 'node:crypto'
import { headers } from 'next/headers'
import { createServiceRoleClient, createSurfaceActionClient } from '@/lib/supabase/server'
import type { Surface } from '@/lib/supabase/surface'
import { sendPasswordResetEmail } from '@/lib/email'

const RATE_LIMIT_MS = 5 * 60 * 1000
const recentRequests = new Map<string, number>()

const SURFACE_PATHS: Record<Surface, {
  forgot: string
  reset: string
  login: string
}> = {
  app: { forgot: '/forgot-password', reset: '/reset-password', login: '/login' },
  vendor: { forgot: '/vendor/forgot-password', reset: '/vendor/reset-password', login: '/vendor/login' },
  console: { forgot: '/console/forgot-password', reset: '/console/reset-password', login: '/console/login' },
}

export type PasswordResetRequestResult = {
  ok: true
  /** CC_MAIL_SUPPRESS + 内部シンクのローカル検証時にだけ返す。 */
  debugLink?: string
  /** UI文言には出さず、恒久E2Eが5分制限を機械確認するための印。 */
  rateLimited?: boolean
}

export type PasswordResetActionResult =
  | { ok: true }
  | { ok: false; error: 'invalid-link' | 'password-too-short' | 'password-mismatch' | 'update-failed' }

function normalizedEmail(email: string): string {
  return email.trim().toLowerCase()
}

function rateLimitKey(email: string): string {
  return createHash('sha256').update(email).digest('hex')
}

function takeRateLimit(email: string, now = Date.now()): boolean {
  const key = rateLimitKey(email)
  const previous = recentRequests.get(key)
  if (previous && now - previous < RATE_LIMIT_MS) return false
  recentRequests.set(key, now)

  // Serverless instance内のbest-effort制限。無制限増加を避け、期限切れだけを掃除する。
  if (recentRequests.size > 500) {
    for (const [candidate, timestamp] of recentRequests) {
      if (now - timestamp >= RATE_LIMIT_MS) recentRequests.delete(candidate)
    }
  }
  return true
}

async function resetOrigin(surface: Surface): Promise<string> {
  const hdrs = await headers()
  const host = (hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? '').split(',')[0].trim().toLowerCase()

  if (host === 'console.mb-partners.app') return 'https://console.mb-partners.app'
  if (host === 'mb-partners.app' || host === 'www.mb-partners.app') return 'https://mb-partners.app'
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) {
    return `http://${host}`
  }
  if (process.env.VERCEL_URL && host === process.env.VERCEL_URL.toLowerCase()) {
    return `https://${host}`
  }
  return surface === 'console' ? 'https://console.mb-partners.app' : 'https://mb-partners.app'
}

async function requestPasswordReset(
  surface: Surface,
  emailInput: string,
): Promise<PasswordResetRequestResult> {
  const email = normalizedEmail(emailInput)
  if (!email || !takeRateLimit(email)) return { ok: true, rateLimited: !!email }

  try {
    const admin = await createServiceRoleClient()
    const redirectTo = `${await resetOrigin(surface)}${SURFACE_PATHS[surface].reset}`
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    })

    // 存在しないメールを含む全失敗は、外から同じ成功結果に見せる。
    const properties = error ? null : data.properties
    if (!properties?.action_link || !properties.hashed_token) return { ok: true }

    // generateLink の action_link は暗黙フロー（URL fragment）になるためSSRから読めない。
    // 同じ単回使用recovery tokenを公式SSR token_hash文法で中央factoryへ渡す。
    const resetUrl = new URL(`${await resetOrigin(surface)}${SURFACE_PATHS[surface].reset}`)
    resetUrl.searchParams.set('token_hash', properties.hashed_token)
    resetUrl.searchParams.set('type', 'recovery')
    await sendPasswordResetEmail({ to: email, url: resetUrl.toString() })

    if (process.env.CC_MAIL_SUPPRESS === '1' && email.endsWith('@mb-system.internal')) {
      console.info(`[password-reset:suppressed] surface=${surface} reset_link=${resetUrl.toString()}`)
      return { ok: true, debugLink: resetUrl.toString() }
    }
  } catch {
    // メール列挙を防ぐため、管理API/送信基盤の成否は公開しない。
  }
  return { ok: true }
}

async function exchangeRecoveryCode(
  surface: Surface,
  credential: { code?: string; tokenHash?: string },
): Promise<PasswordResetActionResult> {
  if (!credential.code && !credential.tokenHash) return { ok: false, error: 'invalid-link' }
  try {
    const supabase = await createSurfaceActionClient(surface, SURFACE_PATHS[surface].reset)
    const { error } = credential.code
      ? await supabase.auth.exchangeCodeForSession(credential.code)
      : await supabase.auth.verifyOtp({ type: 'recovery', token_hash: credential.tokenHash! })
    return error ? { ok: false, error: 'invalid-link' } : { ok: true }
  } catch {
    return { ok: false, error: 'invalid-link' }
  }
}

async function updatePassword(
  surface: Surface,
  password: string,
  confirmation: string,
): Promise<PasswordResetActionResult> {
  if (password.length < 8) return { ok: false, error: 'password-too-short' }
  if (password !== confirmation) return { ok: false, error: 'password-mismatch' }

  try {
    const supabase = await createSurfaceActionClient(surface, SURFACE_PATHS[surface].reset)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) return { ok: false, error: 'update-failed' }
    // 当該surfaceの回復セッションだけを破棄。他surfaceのcookieには中央ガード上も触れない。
    await supabase.auth.signOut({ scope: 'local' })
    return { ok: true }
  } catch {
    return { ok: false, error: 'update-failed' }
  }
}

export async function requestAppPasswordReset(email: string) {
  return requestPasswordReset('app', email)
}
export async function requestVendorPasswordReset(email: string) {
  return requestPasswordReset('vendor', email)
}
export async function requestConsolePasswordReset(email: string) {
  return requestPasswordReset('console', email)
}

export async function exchangeAppRecoveryCode(credential: { code?: string; tokenHash?: string }) {
  return exchangeRecoveryCode('app', credential)
}
export async function exchangeVendorRecoveryCode(credential: { code?: string; tokenHash?: string }) {
  return exchangeRecoveryCode('vendor', credential)
}
export async function exchangeConsoleRecoveryCode(credential: { code?: string; tokenHash?: string }) {
  return exchangeRecoveryCode('console', credential)
}

export async function updateAppPassword(password: string, confirmation: string) {
  return updatePassword('app', password, confirmation)
}
export async function updateVendorPassword(password: string, confirmation: string) {
  return updatePassword('vendor', password, confirmation)
}
export async function updateConsolePassword(password: string, confirmation: string) {
  return updatePassword('console', password, confirmation)
}
