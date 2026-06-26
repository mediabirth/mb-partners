import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { signLoginState, loginAuthorizeUrl, safeAppRedirect } from '@/lib/line-auth'

// LINE Login 認証の開始（新規・独立フロー）。事前アプリセッション不要。
// ★既存 password ログイン・proxy 認証判定・/api/line/start(連携専用) には一切触れない。
// single-use state を line_login_nonces に発行（10分失効）。redirect は /app 配下のみ保持。
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const redirect = safeAppRedirect(req.nextUrl.searchParams.get('redirect'))   // /app 配下のみ・不正/外部は null
    const nonce = crypto.randomBytes(16).toString('hex')
    const exp = Date.now() + 10 * 60 * 1000

    const admin = await createServiceRoleClient()
    await admin.from('line_login_nonces').insert({ nonce, redirect, expires_at: new Date(exp).toISOString() })

    const state = signLoginState(nonce, exp)
    const res = NextResponse.redirect(loginAuthorizeUrl(state))
    res.headers.set('Referrer-Policy', 'no-referrer')   // state を Referrer に残さない
    return res
  } catch {
    return NextResponse.redirect('https://mb-partners.app/login?error=line')
  }
}
