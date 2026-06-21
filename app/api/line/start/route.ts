import { NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { signState, authorizeUrl } from '@/lib/line-login'

// L-B：LINE連携の開始（ログイン済み partner 本人のみ）。
// CSRF/リプレイ対策はサーバ側 single-use nonce（line_oauth_nonces）に保存。state は署名済(partnerId内包・偽造不可)。
// ★ログイン手段ではない：未ログインは弾く。既存認証/ログイン経路・Cookie semantics は不変。
export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect('https://mb-partners.app/login')

  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.redirect('https://mb-partners.app/login')

  const nonce = crypto.randomBytes(16).toString('hex')
  const exp = Date.now() + 10 * 60 * 1000

  // サーバ側に nonce を保存（single-use・10分失効）。callback はこれを consume して検証する（Cookie非依存）。
  const admin = await createServiceRoleClient()
  await admin.from('line_oauth_nonces').insert({ nonce, partner_id: partner.id, expires_at: new Date(exp).toISOString() })

  const state = signState(partner.id, nonce, exp)
  const res = NextResponse.redirect(authorizeUrl(state))
  res.headers.set('Referrer-Policy', 'no-referrer')
  return res
}
