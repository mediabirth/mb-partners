/**
 * POST /api/console/applications/[id]/approve
 * 面談後の「承認＝リファラルへ迎え入れ」。応募者宛にパートナー招待（invites）を発行し、
 * status='approved' / invited_at / activated_at を立てる。紹介元があれば賞賛通知（従来踏襲・非金銭）。
 * ★money/deals/報酬 非接触。実アカウント作成は招待受諾フロー（/invite/accept）に委ねる。冪等。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { sendInviteEmail } from '@/lib/email'
import { partnerFacingOrigin, requestOrigin } from '@/lib/app-origin'
import { notify } from '@/lib/notify/index'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['owner', 'manager'].includes(profile?.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const admin = await createServiceRoleClient()
    const { data: app } = await admin
      .from('partner_applications')
      .select('id, name, email, status, referrer_partner_id, invited_at')
      .eq('id', id)
      .maybeSingle()
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (app.status === 'approved' || app.invited_at) return NextResponse.json({ ok: true, already: true })
    if (app.status === 'rejected') return NextResponse.json({ error: '見送り済みの応募です' }, { status: 409 })
    if (!app.email) return NextResponse.json({ error: 'メールアドレスが無いため招待できません' }, { status: 400 })

    // パートナー招待を発行（invites）。実アカウント作成は受諾時（/invite/accept）。
    const { data: invite, error: invErr } = await admin
      .from('invites')
      .insert({ email: app.email.trim().toLowerCase(), kind: 'partner', role: 'partner', name: app.name || null, created_by: user.id })
      .select('token, email, name, expires_at')
      .single()
    if (invErr || !invite) return NextResponse.json({ error: '招待の作成に失敗しました' }, { status: 500 })

    const origin = partnerFacingOrigin(requestOrigin(req))
    const invite_url = `${origin}/invite/${invite.token}`
    let emailed = false
    try {
      const mail = await sendInviteEmail({ to: invite.email, name: invite.name, url: invite_url, expiresAt: invite.expires_at, kind: 'partner' })
      emailed = mail.sent
    } catch { /* best-effort：招待URLはコンソールからも共有可能 */ }

    // 承認マーク（status/invited_at/activated_at）。money/accountには非接触。
    const now = new Date().toISOString()
    await admin.from('partner_applications')
      .update({ status: 'approved', invited_at: now, activated_at: now })
      .eq('id', id)

    // 紹介元があれば賞賛通知（従来踏襲・非金銭・金額/件数は含めない）。best-effort。
    if (app.referrer_partner_id) {
      try {
        await notify(admin, app.referrer_partner_id, {
          title: `${app.name}さんが仲間に加わりました`,
          body: 'あなたの紹介に、心から感謝します。信頼の輪が、あなたから確かに広がっています。— MB Partners',
          url: '/app', tag: `recognition-${app.id}`, ref: { type: 'recognition', application_id: app.id },
        }, { event: 'recognition' })
      } catch { /* best-effort */ }
    }

    return NextResponse.json({ ok: true, invite_url, emailed })
  } catch {
    return NextResponse.json({ error: '処理に失敗しました' }, { status: 500 })
  }
}
