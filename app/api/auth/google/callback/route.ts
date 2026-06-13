/**
 * GET /api/auth/google/callback
 * Google OAuth コールバック
 * code → token 交換 → calendar_links に upsert → /app/calendar にリダイレクト
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { encryptTokens } from '@/lib/google-token'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code  = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    ? req.url.split('/api')[0]
    : 'http://localhost:3000'
  const appUrl = new URL(req.url).origin

  if (error) {
    return NextResponse.redirect(`${appUrl}/app/calendar?error=${encodeURIComponent(error)}`)
  }
  if (!code || !state) {
    return NextResponse.redirect(`${appUrl}/app/calendar?error=missing_params`)
  }

  // state をデコードして partner_id を取得
  let partnerId: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    partnerId = decoded.partner_id
    if (!partnerId) throw new Error('no partner_id')
  } catch {
    return NextResponse.redirect(`${appUrl}/app/calendar?error=invalid_state`)
  }

  // code → tokens 交換
  let tokens: { access_token: string; refresh_token: string; expires_in: number }
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI!,
        grant_type:    'authorization_code',
      }),
    })
    if (!res.ok) throw new Error(await res.text())
    tokens = await res.json()
    if (!tokens.refresh_token) throw new Error('no refresh_token — user may need to re-consent')
  } catch (e: any) {
    console.error('[OAuth callback] token exchange error:', e.message)
    return NextResponse.redirect(`${appUrl}/app/calendar?error=token_exchange_failed`)
  }

  // Google アカウントのメールアドレス取得
  let googleEmail = ''
  try {
    const uiRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const uiData = await uiRes.json()
    googleEmail = uiData.email ?? ''
  } catch { /* ignore */ }

  // トークンを暗号化
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
  const encrypted = encryptTokens({
    access_token:  tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at:    expiresAt,
  })

  // calendar_links に upsert（partner_id でユニーク）
  const supabase = await createServiceRoleClient()
  const { error: upsertErr } = await supabase
    .from('calendar_links')
    .upsert(
      {
        partner_id:   partnerId,
        google_email: googleEmail,
        oauth_tokens: encrypted,
        active:       true,
        owner_name:   googleEmail,   // owner_name は NOT NULL なので email を代入
        service_ids:  [],            // 後で設定画面から変更可
      },
      { onConflict: 'partner_id' }
    )

  if (upsertErr) {
    console.error('[OAuth callback] upsert error:', upsertErr.message)
    return NextResponse.redirect(`${appUrl}/app/calendar?error=save_failed`)
  }

  return NextResponse.redirect(`${appUrl}/app/calendar?connected=1`)
}
