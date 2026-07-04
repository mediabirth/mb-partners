/**
 * POST /api/meetings
 * 公開予約の確定。予定は MB中心アカウント(mb_calendar)に作成し Google Meet を生成（best-effort）、
 * パートナー＋顧客を attendees に招待。meetings テーブルに保存（サービスロール／公開エンドポイント）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'
import { createCentralMeetEvent } from '@/lib/mb-calendar-event'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { partner_id, start_at, end_at, client_name, client_email } = body
  // ② 公開予約ページのフリーテキスト（任意）。予約成立・空き枠・カレンダー・Meet には非接触・保存/通知のみ。
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : ''

  if (!partner_id || !start_at || !end_at || !client_name || !client_email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // パートナー情報取得（name/email は profiles から）
  const { data: partner } = await supabase
    .from('partners')
    .select('id, profile_id')
    .eq('id', partner_id)
    .single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', partner.profile_id)
    .single()

  // MB中心アカウントで予定＋Meetを作成（best-effort：未連携/失敗でも予約は保存）。
  let googleEventId: string | null = null
  let meetingUrl: string | null = null
  try {
    const r = await createCentralMeetEvent(supabase, {
      summary:      `${profile?.name ?? 'パートナー'} × ${client_name} 相談`,
      description:  `予約者: ${client_name} (${client_email})`,
      startAt:      new Date(start_at),
      endAt:        new Date(end_at),
      partnerEmail: profile?.email ?? null,
      partnerName:  profile?.name ?? null,
      clientEmail:  client_email,
      clientName:   client_name,
    })
    googleEventId = r.eventId
    meetingUrl = r.meetingUrl
  } catch { /* best-effort */ }

  // meetings テーブルに保存（中心アカウント運用のため calendar_link_id は null）
  const { data: meeting, error: insertErr } = await supabase
    .from('meetings')
    .insert({
      partner_id,
      calendar_link_id: null,
      start_at,
      end_at,
      client_name,
      client_email,
      note:             note || null,
      status:           'booked',
      google_event_id:  googleEventId,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[meetings] insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // meeting_url は列未追加(DDL前)でも予約保存を壊さないよう分離した best-effort。
  if (meetingUrl) {
    try { await supabase.from('meetings').update({ meeting_url: meetingUrl }).eq('id', meeting.id) } catch { /* 列なし時は無視 */ }
  }

  // R1① 顧客へ予約完了メール（ベストエフォート）＋ Meetリンク
  try {
    const { sendBookingConfirmEmail } = await import('@/lib/email')
    await sendBookingConfirmEmail({ to: client_email, clientName: client_name, partnerName: profile?.name ?? null, startAt: start_at, meetingUrl })
  } catch { /* best-effort */ }

  // パートナーに予約通知
  const startJST = new Date(start_at).toLocaleString('ja', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  })
  await createNotification(
    supabase,
    partner_id,
    '新しい予約が入りました',
    `${client_name} — ${startJST}`,
    { type: 'meeting', id: meeting.id },
  )

  // Batch B ②: 運営Slack/メール + 担当パートナーへメール（顧客確認メールは上で送信済み）。Meetリンク同梱。best-effort。
  try {
    const { sendSlack, sendOpsEmail, sendEmail, fmtJST } = await import('@/lib/notify')
    const whenJa = fmtJST(start_at)
    const meetLine = meetingUrl ? `\n・Meet：${meetingUrl}` : ''
    const noteLineSlack = note ? `\nメモ: ${note}` : ''
    const noteLineMail = note ? `\n・ご相談内容：${note}` : ''
    await sendSlack(`📅 商談予約: ${client_name} — ${whenJa}${profile?.name ? `（担当: ${profile.name}）` : ''}${meetingUrl ? `\nMeet: ${meetingUrl}` : ''}${noteLineSlack}`)
    await sendOpsEmail(`【MB Partners】商談予約: ${client_name}`, `商談予約が入りました。\n・お客さま：${client_name}\n・日時：${whenJa}\n・担当：${profile?.name ?? '—'}${noteLineMail}${meetLine}`)
    if (profile?.email) {
      const { sendTemplatedEmail } = await import('@/lib/mail-send')
      await sendTemplatedEmail({
        key: 'booking-partner', to: profile.email, toRole: 'partner',
        vars: { name: profile?.name ?? 'パートナー', customer: client_name, when: whenJa, meetingUrl: meetingUrl ?? '' },
        meta: { meeting_id: meeting.id },
      })
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ meeting_id: meeting.id, meeting_url: meetingUrl }, { status: 201 })
}
