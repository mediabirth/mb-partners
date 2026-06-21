import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { verifyState, LINE_REDIRECT_URI } from '@/lib/line-login'

// L-B fix：LINE連携の callback を Cookie非依存に。
// partner特定は「/api/line/start で“認証済みpartner本人”にのみ発行された署名済 state」から行う（偽造不可）。
// CSRF/リプレイ対策はサーバ側 single-use nonce（line_oauth_nonces）を consume して担保。
// ★これは通知用 userId 取得のみ。アプリのログイン手段にはしない（既存authは不変）。
export const runtime = 'nodejs'

function back(status: 'success' | 'error') {
  const res = NextResponse.redirect(`https://mb-partners.app/app/settings?line=${status}`)
  res.headers.set('Referrer-Policy', 'no-referrer') // state を Referrer に残さない
  return res
}

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')
    const state = req.nextUrl.searchParams.get('state')
    if (!code || !state) return back('error')

    // 1) state 署名＋失効を検証（partnerId を取り出す。Cookie/セッションには依存しない）。
    const st = verifyState(state)
    if (!st) return back('error')

    const admin = await createServiceRoleClient()

    // 2) サーバ側 nonce：存在＋partner一致＋未使用＋未失効 を確認し、single-use で即 consume（リプレイ防止）。
    const { data: row } = await admin
      .from('line_oauth_nonces')
      .select('nonce, partner_id, expires_at, used_at')
      .eq('nonce', st.nonce)
      .maybeSingle()
    if (!row || row.partner_id !== st.partnerId || row.used_at || new Date(row.expires_at).getTime() < Date.now()) {
      return back('error')
    }
    // 条件付き update（used_at is null のときだけ）で single-use を原子的に確定。2回目は0行→拒否。
    const { data: consumed } = await admin
      .from('line_oauth_nonces')
      .update({ used_at: new Date().toISOString() })
      .eq('nonce', st.nonce)
      .is('used_at', null)
      .select('nonce')
    if (!consumed || consumed.length === 0) return back('error')

    // partnerId は署名済 state ＋ consume 済 nonce から信頼（Cookie不要）。
    const partnerId = st.partnerId

    // 3) フォールバック強化：セッションがある文脈なら session partner と一致も確認（無くても state で成立）。
    try {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: sp } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
        if (sp && sp.id !== partnerId) return back('error') // session があるのに別partner = 拒否
      }
    } catch { /* セッション無し文脈(iOS)は state で成立 */ }

    // 4) code → token 交換 → userId（/v2/profile）→ partner_line_links upsert（本人の partner_id のみ）。
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
    const tk = (await tokenRes.json()) as { access_token?: string }
    if (!tk.access_token) return back('error')

    const profRes = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${tk.access_token}` } })
    if (!profRes.ok) return back('error')
    const prof = (await profRes.json()) as { userId?: string }
    if (!prof.userId) return back('error')

    await admin.from('partner_line_links').upsert(
      { partner_id: partnerId, line_user_id: prof.userId, linked_at: new Date().toISOString() },
      { onConflict: 'partner_id' },
    )

    return back('success')
  } catch {
    return back('error')
  }
}
