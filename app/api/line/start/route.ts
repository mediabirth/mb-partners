import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { signState, authorizeUrl } from '@/lib/line-login'

// L-B：LINE連携の開始（ログイン済み partner 本人のみ）。state(署名)＋nonce(CSRF cookie)を発行し LINE authorize へ。
// ★ログイン手段ではない：未ログインは弾く。既存認証/ログイン経路は不変。
export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect('https://mb-partners.app/login')

  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.redirect('https://mb-partners.app/login')

  const nonce = crypto.randomBytes(16).toString('hex')
  const exp = Date.now() + 10 * 60 * 1000
  const state = signState(partner.id, nonce, exp)

  const res = NextResponse.redirect(authorizeUrl(state))
  // CSRF double-submit 用 nonce（httpOnly・10分）。
  res.cookies.set('line_oauth_nonce', nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 })
  return res
}
