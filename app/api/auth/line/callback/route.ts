import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { cookieNameFor } from '@/lib/supabase/surface'
import { verifyLoginState, safeAppRedirect, LINE_LOGIN_REDIRECT_URI } from '@/lib/line-auth'

// LINE Login 認証の callback（新規・独立フロー）。
// ★セキュリティ：state single-use（line_login_nonces consume）＋ LINE token はOUR channel で交換（userId 偽装不可）
//   ＋ partner_line_links で 1:1 厳密特定（未連携/曖昧は弾く・勝手にアカウント作らない）。
//   発行するセッションは「特定された当該 partner 本人」のみ。他人のトークンを発行しうる経路を持たない。
// ★既存 password ログイン・proxy 認証判定・/api/line/callback(連携専用) には一切触れない。money 非接触。
export const runtime = 'nodejs'

const fail = (reason: string) => NextResponse.redirect(`https://mb-partners.app/login?error=${reason}`)

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')
    const state = req.nextUrl.searchParams.get('state')
    if (!code || !state) return fail('line')

    // 1) state 署名＋失効を検証。
    const st = verifyLoginState(state)
    if (!st) return fail('line')

    const admin = await createServiceRoleClient()

    // 2) single-use nonce を原子的に consume（再利用/期限切れ/不正は弾く）。redirect を取り出す。
    const { data: row } = await admin.from('line_login_nonces').select('nonce, redirect, expires_at, used_at').eq('nonce', st.nonce).maybeSingle()
    if (!row || row.used_at || new Date(row.expires_at).getTime() < Date.now()) return fail('line')
    const { data: consumed } = await admin.from('line_login_nonces').update({ used_at: new Date().toISOString() }).eq('nonce', st.nonce).is('used_at', null).select('nonce')
    if (!consumed || consumed.length === 0) return fail('line')   // 2回目=0行=リプレイ拒否
    const redirect = safeAppRedirect(row.redirect as string | null) || '/app'

    // 3) code→token（OUR LINE Login channel）→ userId。userId は OUR channel の token に紐づく＝偽装不可。
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code, redirect_uri: LINE_LOGIN_REDIRECT_URI,
        client_id: process.env.LINE_LOGIN_CHANNEL_ID || '', client_secret: process.env.LINE_LOGIN_CHANNEL_SECRET || '',
      }),
    })
    if (!tokenRes.ok) return fail('line')
    const tk = (await tokenRes.json()) as { access_token?: string }
    if (!tk.access_token) return fail('line')
    const profRes = await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${tk.access_token}` } })
    if (!profRes.ok) return fail('line')
    const prof = (await profRes.json()) as { userId?: string }
    if (!prof.userId) return fail('line')

    // 4) partner_line_links で 1:1 厳密特定。未連携=弾く（勝手に作らない）。曖昧(>1)=弾く。
    const { data: links } = await admin.from('partner_line_links').select('partner_id').eq('line_user_id', prof.userId)
    if (!links || links.length !== 1) return fail('line_unlinked')
    const partnerId = links[0].partner_id as string

    // 5) partner→auth user（profile_id＝auth.users.id）→ email（権威的に getUserById で取得）。
    const { data: partner } = await admin.from('partners').select('profile_id').eq('id', partnerId).maybeSingle()
    const profileId = partner?.profile_id as string | undefined
    if (!profileId) return fail('line')
    const { data: au } = await admin.auth.admin.getUserById(profileId)
    const email = au?.user?.email
    if (!email) return fail('line')

    // 6) 当該ユーザーのセッションを発行（generateLink magiclink→token_hash を server で verify）。メール送信はされない。
    const { data: link, error: glErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const tokenHash = (link?.properties as { hashed_token?: string } | undefined)?.hashed_token
    if (glErr || !tokenHash) return fail('line')

    // 7) app サーフェス cookie（mb-auth-app）へ書き込む server client で verifyOtp→セッション確立。
    const res = NextResponse.redirect(`https://mb-partners.app${redirect}`)
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookieOptions: { name: cookieNameFor('app') },
        cookies: { getAll: () => req.cookies.getAll(), setAll: (toSet) => toSet.forEach(({ name, value, options }) => res.cookies.set(name, value, options)) },
      },
    )
    const { error: vErr } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' })
    if (vErr) return fail('line')
    return res   // mb-auth-app セッション cookie 付きで目的ページ（/app配下）へ
  } catch {
    return fail('line')
  }
}
