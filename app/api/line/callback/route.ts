import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyState, LINE_REDIRECT_URI } from '@/lib/line-login'

// L-B：LINE連携の callback。state(本人＋CSRF＋失効)を厳格検証し、code→token→userId を取得して
// partner_line_links に upsert。★ログイン済み partner 本人のみ。他人のLINEを他partnerに紐付け不可。
// 失敗は安全に握りつぶし、設定画面へ ?line=error で戻す（既存フロー不変）。
export const runtime = 'nodejs'

function back(status: 'linked' | 'error') {
  return NextResponse.redirect(`https://mb-partners.app/app/settings?line=${status}`)
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')
    const state = req.nextUrl.searchParams.get('state')
    if (!code || !state) return back('error')

    // ログイン必須（連携はログイン手段にしない）＋ session partner を解決。
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return back('error')
    const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
    if (!partner) return back('error')

    // state 検証：署名・失効・partner本人一致。
    const st = verifyState(state)
    if (!st || st.partnerId !== partner.id) return back('error')
    // CSRF double-submit：cookie の nonce と一致。
    const cookieNonce = req.cookies.get('line_oauth_nonce')?.value
    if (!cookieNonce || cookieNonce !== st.nonce) return back('error')

    // code → token 交換（LINE_LOGIN_CHANNEL_SECRET 使用）。
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: LINE_REDIRECT_URI,
        client_id: process.env.LINE_LOGIN_CHANNEL_ID || '',
        client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET || '',
      }),
    })
    if (!tokenRes.ok) return back('error')
    const tk = (await tokenRes.json()) as { access_token?: string; friendship_status_changed?: boolean }
    if (!tk.access_token) return back('error')

    // userId は /v2/profile から（scope profile）。
    const profRes = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${tk.access_token}` } })
    if (!profRes.ok) return back('error')
    const prof = (await profRes.json()) as { userId?: string }
    if (!prof.userId) return back('error')

    // partner_line_links に upsert（service_role）。本人の partner_id にのみ書き込む。
    const admin = await createServiceRoleClient()
    await admin.from('partner_line_links').upsert(
      { partner_id: partner.id, line_user_id: prof.userId, linked_at: new Date().toISOString() },
      { onConflict: 'partner_id' },
    )

    const res = back('linked')
    res.cookies.set('line_oauth_nonce', '', { path: '/', maxAge: 0 }) // nonce 破棄
    return res
  } catch {
    return back('error')
  }
}
