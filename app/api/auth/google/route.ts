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

  // 段階A：?mode=mb_add のとき「追加アカウント連携」。それ以外は従来分岐（mode:'mb' / partner）を完全維持。
  const addMode = new URL(req.url).searchParams.get('mode') === 'mb_add'
  const addLabel = (new URL(req.url).searchParams.get('label') || '').trim().slice(0, 60)

  let statePayload: Record<string, unknown>
  if (addMode && profile && profile.role !== 'partner') {
    statePayload = { mode: 'mb_add', label: addLabel, nonce: randomBytes(16).toString('hex') } // 追加アカウント（mb_calendars へ INSERT）
  } else if (partner && profile?.role === 'partner') {
    statePayload = { partner_id: partner.id, nonce: randomBytes(16).toString('hex') }
  } else if (profile && profile.role !== 'partner') {
    statePayload = { mode: 'mb', nonce: randomBytes(16).toString('hex') } // MB運営
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
