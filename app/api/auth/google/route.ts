/**
 * GET /api/auth/google
 * Google OAuth 認可画面へリダイレクト
 * state = base64(JSON{partner_id, nonce}) でCSRF対策
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { randomBytes } from 'crypto'

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events',
  'email',
  'profile',
].join(' ')

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // owner/manager は MB運営カレンダー連携（partner不要）。partner は自分のカレンダー。
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()

  // 段階2：?mode=member のとき「自分のカレンダー連携」（member_calendar_links へ自分の user_id 行で保存）。
  // ★uid は認証セッション本人の id を state に載せる（他人を指定できない）。mode:'mb'/partner は従来維持。
  const reqMode = new URL(req.url).searchParams.get('mode')

  let statePayload: Record<string, unknown>
  if (reqMode === 'member' && profile && profile.role !== 'partner') {
    statePayload = { mode: 'member', uid: user.id, nonce: randomBytes(16).toString('hex') } // 自分のカレンダー連携
  } else if (partner && profile?.role === 'partner') {
    statePayload = { partner_id: partner.id, nonce: randomBytes(16).toString('hex') }
  } else if (profile && profile.role !== 'partner') {
    statePayload = { mode: 'mb', nonce: randomBytes(16).toString('hex') } // MB運営（mb_calendar id=1・当面残す）
  } else {
    return NextResponse.json({ error: 'No calendar identity' }, { status: 404 })
  }

  const state = Buffer.from(JSON.stringify(statePayload)).toString('base64url')

  const redirectUri = process.env.GOOGLE_REDIRECT_URI!
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',   // refresh_token を取得するため
    prompt:        'consent',   // 常に consent 画面（refresh_token 再取得のため）
    state,
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  )
}
