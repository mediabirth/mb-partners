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

  // state をデコード。mode='mb'(MB運営) か partner_id(個人) を判定
  let partnerId: string | null = null
  let isMb = false
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    if (decoded.mode === 'mb') isMb = true
    else { partnerId = decoded.partner_id; if (!partnerId) throw new Error('no id') }
  } catch {
    return NextResponse.redirect(`${appUrl}/app/calendar?error=invalid_state`)
  }
  // 連携後の戻り先
  const okUrl  = isMb ? `${appUrl}/console/settings?calendar=connected` : `${appUrl}/app/calendar?connected=1`
  const errUrl = (e: string) => isMb ? `${appUrl}/console/settings?calendar_error=${e}` : `${appUrl}/app/calendar?error=${e}`

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
    return NextResponse.redirect(errUrl('token_exchange_failed'))
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

  const supabase = await createServiceRoleClient()

  if (isMb) {
    // MB運営カレンダー: mb_calendar(id=1) に保存
    const { error: mbErr } = await supabase
      .from('mb_calendar')
      .upsert({ id: 1, google_email: googleEmail, oauth_tokens: encrypted, active: true, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    if (mbErr) {
      console.error('[OAuth callback] mb_calendar upsert error:', mbErr.message)
      // テーブル未作成（DDL未実行）の可能性 → 明示エラーで戻す
      return NextResponse.redirect(errUrl('mb_save_failed'))
    }
    return NextResponse.redirect(okUrl)
  }

  // 個人パートナー: calendar_links に upsert（partner_id でユニーク）
  const { error: upsertErr } = await supabase
    .from('calendar_links')
    .upsert(
      {
        partner_id:   partnerId,
        google_email: googleEmail,
        oauth_tokens: encrypted,
        active:       true,
        owner_name:   googleEmail,
        service_ids:  [],
      },
      { onConflict: 'partner_id' }
    )

  if (upsertErr) {
    console.error('[OAuth callback] upsert error:', upsertErr.message)
    return NextResponse.redirect(errUrl('save_failed'))
  }

  return NextResponse.redirect(okUrl)
}
