import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { lineChannel } from '@/lib/notify/line'
import { sendEmail } from '@/lib/notify'

// メッセージ司令塔 Phase1：owner の手動送信（LINE push / Resendメール）＋ 全履歴を隔離表 messages(direction='out') へ記録。
// ★既存 notify() ディスパッチャ（通知4種/リマインド/勝ち通知）には割り込まない＝独立した手動送信経路。
// ★money/deals/帰属/既存RLS 非接触。messages のみ書込（service_role）。例外安全（throwしない）。
export const runtime = 'nodejs'

const MAX_BODY = 5000

export async function POST(req: NextRequest) {
  try {
    // owner gate（既存consoleパターン）。
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const b = await req.json().catch(() => ({}))
    const channel = b.channel === 'email' ? 'email' : b.channel === 'line' ? 'line' : null
    const partnerId = typeof b.partnerId === 'string' && b.partnerId ? b.partnerId : null
    const customerEmail = typeof b.customerEmail === 'string' && b.customerEmail.trim() ? b.customerEmail.trim() : null
    const subject = typeof b.subject === 'string' ? b.subject.trim().slice(0, 200) : null
    const body = typeof b.body === 'string' ? b.body.trim().slice(0, MAX_BODY) : ''
    const attachments = Array.isArray(b.attachments) ? b.attachments.slice(0, 5) : null
    if (!channel) return NextResponse.json({ error: 'channel が不正です' }, { status: 400 })
    if (!body) return NextResponse.json({ error: '本文を入力してください' }, { status: 400 })

    const admin = await createServiceRoleClient()
    const threadKey = partnerId ? `partner:${partnerId}` : customerEmail ? `email:${customerEmail.toLowerCase()}` : null
    if (!threadKey) return NextResponse.json({ error: '送信先がありません' }, { status: 400 })

    let status = 'sent'
    let error: string | null = null

    if (channel === 'line') {
      // partner × LINE：line_user_id がある partner のみ（無ければ未連携エラー・記録は残さず400）。
      if (!partnerId) return NextResponse.json({ error: 'LINEはパートナー宛のみです' }, { status: 400 })
      const { data: link } = await admin.from('partner_line_links').select('line_user_id').eq('partner_id', partnerId).maybeSingle()
      if (!link?.line_user_id) return NextResponse.json({ error: 'このパートナーはLINE未連携です' }, { status: 400 })
      const r = await lineChannel.deliver(admin, partnerId, { title: '', body })
      if (r.sent < 1) { status = 'failed'; error = 'LINE送信に失敗しました' }
    } else {
      // email：customerEmail（顧客 or パートナーのメール）宛。
      if (!customerEmail) return NextResponse.json({ error: 'メール宛先がありません' }, { status: 400 })
      const r = await sendEmail({
        to: customerEmail, subject: subject || 'MB Partners', text: body,
        attachments: attachments ? attachments.filter((a: { filename?: string; content?: string }) => a?.filename && a?.content).map((a: { filename: string; content: string }) => ({ filename: a.filename, content: a.content })) : undefined,
      })
      if (!r.sent) { status = 'failed'; error = r.skipped || r.error || 'メール送信に失敗しました' }
    }

    // 送信成否に関わらず out を記録（失敗も status='failed'＋error で残す）。
    const { data: row } = await admin.from('messages').insert({
      partner_id: partnerId, customer_email: customerEmail, direction: 'out', channel,
      subject, body, attachments: attachments && attachments.length ? attachments : null,
      status, error, sent_by: user.id, thread_key: threadKey,
    }).select('id, created_at, direction, channel, body, subject, status, error, thread_key').single()

    return NextResponse.json({ ok: status === 'sent', status, error, message: row })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '送信に失敗しました' }, { status: 500 })
  }
}
