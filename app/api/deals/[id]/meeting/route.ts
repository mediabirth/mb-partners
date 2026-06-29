/**
 * POST /api/deals/[id]/meeting
 * パートナーが自分の案件に商談日時を設定（in-app）。
 * - 予定は MB中心アカウント(mb_calendar)に作成し、Google Meet リンクを生成（best-effort）。
 *   パートナー＋顧客(メールがあれば)を attendees に招待（sendUpdates=all）。
 * - deals.meeting_at / calendar_event_id / meeting_url を更新（未連携でも meeting_at は保存）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { createCentralMeetEvent, resolveCalendarMemberId } from '@/lib/mb-calendar-event'

// node ランタイム（Google連携・暗号化トークンを扱うため）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { start_at, end_at, customer_email } = await req.json()
  if (!start_at || !end_at) return NextResponse.json({ error: 'start_at and end_at required' }, { status: 400 })
  const bodyEmail = (typeof customer_email === 'string' ? customer_email.trim() : '') || null

  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  // 案件は本人のものに限定
  const { data: deal } = await supabase
    .from('deals')
    .select('id, customer_name, partner_id, service_id, menu_ref')
    .eq('id', id)
    .eq('partner_id', partner.id)
    .single()
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('name, email').eq('id', user.id).single()
  const admin = await createServiceRoleClient()

  // 顧客メールを解決（入力 or 既存）。customer_email 列が未追加(DDL前)でも壊さない best-effort。
  let customerEmail: string | null = bodyEmail
  try {
    if (bodyEmail) {
      await admin.from('deals').update({ customer_email: bodyEmail }).eq('id', id)
    } else {
      const { data: row } = await admin.from('deals').select('customer_email').eq('id', id).single()
      customerEmail = (row as { customer_email?: string | null } | null)?.customer_email ?? null
    }
  } catch { /* best-effort */ }

  // 段階3a：商談を入れる担当メンバーを解決（menu→service→既定owner）。未割当=null→owner(kthk.kmbr)。
  const memberId = await resolveCalendarMemberId(admin, {
    menuRef: (deal as { menu_ref?: string | null }).menu_ref ?? null,
    serviceId: (deal as { service_id?: string | null }).service_id ?? null,
  })

  // MB中心アカウントで予定＋Meetを作成（best-effort：未連携/失敗でも meeting_at は保存）。
  let eventId: string | null = null
  let meetingUrl: string | null = null
  try {
    const r = await createCentralMeetEvent(admin, {
      summary:      `${deal.customer_name} 商談`,
      description:  `${profile?.name ?? 'パートナー'} の案件商談`,
      startAt:      new Date(start_at),
      endAt:        new Date(end_at),
      partnerEmail: profile?.email ?? null,
      partnerName:  profile?.name ?? null,
      clientEmail:  customerEmail,
      clientName:   deal.customer_name,
    }, memberId)
    eventId = r.eventId
    meetingUrl = r.meetingUrl
  } catch { /* best-effort */ }

  // 所有確認は authed select 済み。UPDATE は RLS 回避のため service role。meeting_at は必須保存。
  const { error } = await admin
    .from('deals')
    .update({ meeting_at: start_at, calendar_event_id: eventId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('partner_id', partner.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // meeting_url は列未追加(DDL前)でも meeting_at 保存を壊さないよう分離した best-effort。
  if (meetingUrl) {
    try { await admin.from('deals').update({ meeting_url: meetingUrl }).eq('id', id) } catch { /* 列なし時は無視 */ }
  }

  // P: 自動チェック — 商談設定で auto タスク（trigger 'meeting_set'）を完了（冪等・best-effort）。
  try {
    const { markAutoTaskDone } = await import('@/lib/coop-tasks')
    await markAutoTaskDone(admin, id, 'meeting_set')
  } catch { /* best-effort */ }

  // 顧客へ予約確認メール（連絡先がある場合のみ）＋ Meetリンク。
  try {
    if (customerEmail) {
      const { sendBookingConfirmEmail } = await import('@/lib/email')
      await sendBookingConfirmEmail({
        to: customerEmail,
        clientName: deal.customer_name,
        partnerName: profile?.name ?? null,
        startAt: start_at,
        meetingUrl,
      })
    }
  } catch { /* best-effort */ }

  // パートナー本人へ受付確認メール（Meetリンク同梱）。
  try {
    if (profile?.email) {
      const { data: svc } = await supabase.from('services').select('name').eq('id', (deal as { service_id?: string }).service_id ?? '').single()
      const { sendReceiptEmail } = await import('@/lib/email')
      await sendReceiptEmail({
        to: profile.email,
        partnerName: profile.name,
        kind: 'meeting',
        customerName: deal.customer_name,
        serviceName: svc?.name ?? null,
        meetingAt: start_at,
        meetingUrl,
      })
    }
  } catch { /* best-effort */ }

  // 運営Slack/メール（Meetリンク同梱）。best-effort。
  try {
    const { sendSlack, sendOpsEmail, fmtJST } = await import('@/lib/notify')
    const whenJa = fmtJST(start_at)
    const meetLine = meetingUrl ? `\n・Meet：${meetingUrl}` : ''
    await sendSlack(`📅 商談予約: ${deal.customer_name} — ${whenJa}${profile?.name ? `（担当: ${profile.name}）` : ''}${meetingUrl ? `\nMeet: ${meetingUrl}` : ''}`)
    await sendOpsEmail(`【MB Partners】商談予約: ${deal.customer_name}`, `商談予約が登録されました。\n・お客さま：${deal.customer_name}\n・日時：${whenJa}\n・担当：${profile?.name ?? '—'}${meetLine}`)
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, meeting_at: start_at, calendar_event_id: eventId, meeting_url: meetingUrl, googleSynced: !!eventId })
}
