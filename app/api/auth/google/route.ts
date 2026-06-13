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

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const state = Buffer.from(JSON.stringify({
    partner_id: partner.id,
    nonce: randomBytes(16).toString('hex'),
  })).toString('base64url')

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
