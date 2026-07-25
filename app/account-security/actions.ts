'use server'

import { headers } from 'next/headers'
import { createServiceRoleClient, createSurfaceActionClient } from '@/lib/supabase/server'
import type { Surface } from '@/lib/supabase/surface'
import { sendEmailChangeConfirmation } from '@/lib/email'

type AccountSurface = Extract<Surface, 'app' | 'vendor'>

const RATE_LIMIT_MS = 5 * 60 * 1000
const recentEmailChanges = new Map<string, number>()
const PATHS: Record<AccountSurface, { profile: string; confirm: string }> = {
  app: { profile: '/app/mypage', confirm: '/confirm-email-change' },
  vendor: { profile: '/vendor/mypage', confirm: '/vendor/confirm-email-change' },
}

export type PasswordChangeResult =
  | { ok: true }
  | { ok: false; error: 'current-required' | 'current-invalid' | 'password-too-short' | 'password-mismatch' | 'update-failed' }

export type EmailChangeRequestResult = {
  ok: true
  rateLimited?: boolean
  debugLinks?: { current: string; next: string }
}

export type EmailChangeConfirmationResult =
  | { ok: true; state: 'pending-current' | 'completed'; email?: string }
  | { ok: false; error: 'invalid-link' | 'sync-failed' }

function normalizedEmail(value: string): string {
  return value.trim().toLowerCase()
}

async function takeEmailChangeLimit(userId: string, email: string, now = Date.now()): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${userId}\0${email}`))
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  const previous = recentEmailChanges.get(key)
  if (previous && now - previous < RATE_LIMIT_MS) return false
  recentEmailChanges.set(key, now)
  if (recentEmailChanges.size > 500) {
    for (const [candidate, timestamp] of recentEmailChanges) {
      if (now - timestamp >= RATE_LIMIT_MS) recentEmailChanges.delete(candidate)
    }
  }
  return true
}

async function accountOrigin(surface: AccountSurface): Promise<string> {
  const hdrs = await headers()
  const host = (hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? '').split(',')[0].trim().toLowerCase()
  if (host === 'console.mb-partners.app') return 'https://console.mb-partners.app'
  if (host === 'mb-partners.app' || host === 'www.mb-partners.app') return 'https://mb-partners.app'
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`
  if (process.env.VERCEL_URL && host === process.env.VERCEL_URL.toLowerCase()) return `https://${host}`
  return surface === 'vendor' ? 'https://mb-partners.app' : 'https://mb-partners.app'
}

function actionToken(actionLink: string): string | null {
  try {
    return new URL(actionLink).searchParams.get('token')
  } catch {
    return null
  }
}

async function changePassword(
  surface: AccountSurface,
  currentPassword: string,
  password: string,
  confirmation: string,
): Promise<PasswordChangeResult> {
  if (!currentPassword) return { ok: false, error: 'current-required' }
  if (password.length < 8) return { ok: false, error: 'password-too-short' }
  if (password !== confirmation) return { ok: false, error: 'password-mismatch' }

  try {
    const supabase = await createSurfaceActionClient(surface, PATHS[surface].profile)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const email = userData.user?.email
    if (userError || !email) return { ok: false, error: 'current-invalid' }

    // 本人再確認。同じsurface clientだけを更新し、他面cookieには触れない。
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword })
    if (signInError) return { ok: false, error: 'current-invalid' }

    const { error: updateError } = await supabase.auth.updateUser({ password })
    return updateError ? { ok: false, error: 'update-failed' } : { ok: true }
  } catch {
    return { ok: false, error: 'update-failed' }
  }
}

async function requestEmailChange(
  surface: AccountSurface,
  emailInput: string,
): Promise<EmailChangeRequestResult> {
  const nextEmail = normalizedEmail(emailInput)
  try {
    const supabase = await createSurfaceActionClient(surface, PATHS[surface].profile)
    const { data: userData, error: userError } = await supabase.auth.getUser()
    const user = userData.user
    const currentEmail = normalizedEmail(user?.email ?? '')
    if (userError || !user || !currentEmail || !nextEmail || nextEmail.length > 254 || nextEmail === currentEmail) {
      return { ok: true }
    }
    if (!(await takeEmailChangeLimit(user.id, nextEmail))) return { ok: true, rateLimited: true }

    const admin = await createServiceRoleClient()
    const origin = await accountOrigin(surface)
    const redirectTo = `${origin}${PATHS[surface].confirm}`
    // Secure Email Changeが有効な本番設定では、旧・新アドレスの両方の確認が必要。
    const [currentResult, nextResult] = await Promise.all([
      admin.auth.admin.generateLink({
        type: 'email_change_current',
        email: currentEmail,
        newEmail: nextEmail,
        options: { redirectTo },
      }),
      admin.auth.admin.generateLink({
        type: 'email_change_new',
        email: currentEmail,
        newEmail: nextEmail,
        options: { redirectTo },
      }),
    ])
    if (currentResult.error || nextResult.error) return { ok: true }

    // auth-js 2.108.1 は email_change_new の properties.hashed_token が action_link tokenと
    // 一致しないため、公式action_linkのtoken queryだけを自己管理URLへ移す。
    const currentToken = actionToken(currentResult.data.properties.action_link)
    const nextToken = actionToken(nextResult.data.properties.action_link)
    if (!currentToken || !nextToken) return { ok: true }

    const currentUrl = new URL(redirectTo)
    currentUrl.searchParams.set('token_hash', currentToken)
    currentUrl.searchParams.set('type', 'email_change')
    currentUrl.searchParams.set('stage', 'current')
    const nextUrl = new URL(redirectTo)
    nextUrl.searchParams.set('token_hash', nextToken)
    nextUrl.searchParams.set('type', 'email_change')
    nextUrl.searchParams.set('stage', 'new')

    await Promise.all([
      sendEmailChangeConfirmation({ to: currentEmail, url: currentUrl.toString(), destination: 'current' }),
      sendEmailChangeConfirmation({ to: nextEmail, url: nextUrl.toString(), destination: 'new' }),
    ])

    if (
      process.env.CC_MAIL_SUPPRESS === '1'
      && currentEmail.endsWith('@mb-system.internal')
      && nextEmail.endsWith('@mb-system.internal')
    ) {
      console.info(`[email-change:suppressed] surface=${surface} current_link=${currentUrl} new_link=${nextUrl}`)
      return { ok: true, debugLinks: { current: currentUrl.toString(), next: nextUrl.toString() } }
    }
  } catch {
    // 存在・重複・送信成否をUIから判別させない。
  }
  return { ok: true }
}

async function confirmEmailChange(
  surface: AccountSurface,
  tokenHash: string,
): Promise<EmailChangeConfirmationResult> {
  if (!tokenHash) return { ok: false, error: 'invalid-link' }
  try {
    const supabase = await createSurfaceActionClient(surface, PATHS[surface].confirm)
    const { data, error } = await supabase.auth.verifyOtp({ type: 'email_change', token_hash: tokenHash })
    if (error) return { ok: false, error: 'invalid-link' }
    // 旧アドレス側の確認だけではuser/sessionは返らない。新アドレス側の確認を待つ。
    if (!data.user?.id || !data.user.email) return { ok: true, state: 'pending-current' }

    const admin = await createServiceRoleClient()
    const { data: currentProfile, error: profileReadError } = await admin
      .from('profiles')
      .select('email')
      .eq('id', data.user.id)
      .maybeSingle()
    if (profileReadError || !currentProfile) return { ok: false, error: 'sync-failed' }

    const nextEmail = normalizedEmail(data.user.email)
    const { error: profileUpdateError } = await admin
      .from('profiles')
      .update({ email: nextEmail })
      .eq('id', data.user.id)
    if (profileUpdateError) {
      // authだけが先行した不整合を残さない。profilesの旧値を正として即時ロールバック。
      await admin.auth.admin.updateUserById(data.user.id, {
        email: currentProfile.email,
        email_confirm: true,
      })
      return { ok: false, error: 'sync-failed' }
    }

    // vendorの連絡先も同じ本人紐付けに限って追随。該当行0件はAPP/サプライヤーなので正常。
    await admin.from('deliveries').update({ contact_email: nextEmail }).eq('auth_user_id', data.user.id)
    return { ok: true, state: 'completed', email: nextEmail }
  } catch {
    return { ok: false, error: 'invalid-link' }
  }
}

export async function changeAppPassword(current: string, password: string, confirmation: string) {
  return changePassword('app', current, password, confirmation)
}
export async function changeVendorPassword(current: string, password: string, confirmation: string) {
  return changePassword('vendor', current, password, confirmation)
}
export async function requestAppEmailChange(email: string) {
  return requestEmailChange('app', email)
}
export async function requestVendorEmailChange(email: string) {
  return requestEmailChange('vendor', email)
}
export async function confirmAppEmailChange(tokenHash: string) {
  return confirmEmailChange('app', tokenHash)
}
export async function confirmVendorEmailChange(tokenHash: string) {
  return confirmEmailChange('vendor', tokenHash)
}
