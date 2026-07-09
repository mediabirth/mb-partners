/**
 * POST /api/partners/interview/[token]/book
 * 応募者が面談日時を予約 → 中央アカウントに Google Meet を自動発行し、application を面談予約済みに。
 * ★money/deals/auth/アカウント作成 非接触。partner_applications の面談フィールドのみ更新。常に例外安全。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { createCentralMeetEvent } from '@/lib/mb-calendar-event'

export const runtime = 'nodejs'

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params
    if (!/^[0-9a-fA-F-]{36}$/.test(token)) return NextResponse.json({ error: 'invalid token' }, { status: 400 })
    const body = await req.json().catch(() => ({}))
    const start_at = typeof body.start_at === 'string' ? body.start_at : ''
    const end_at = typeof body.end_at === 'string' ? body.end_at : ''
    if (!start_at || !end_at) return NextResponse.json({ error: '日時が不正です' }, { status: 400 })
    const startMs = new Date(start_at).getTime()
    if (!Number.isFinite(startMs) || startMs < Date.now()) return NextResponse.json({ error: '過去の日時は指定できません' }, { status: 400 })

    const admin = await createServiceRoleClient()
    const { data: app } = await admin
      .from('partner_applications')
      .select('id, name, email, status')
      .eq('interview_token', token)
      .maybeSingle()
    if (!app) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (app.status !== 'applied') return NextResponse.json({ error: 'すでに面談が予約されています', already: true }, { status: 409 })

    // 中央アカウントで面談予定＋Meetを作成（best-effort：未連携でも予約は成立）。
    let meetingUrl: string | null = null
    try {
      const r = await createCentralMeetEvent(admin, {
        summary: `MB Partners 面談 × ${app.name ?? '応募者'}`,
        description: `パートナー応募者との面談\n応募者: ${app.name ?? ''}${app.email ? ` (${app.email})` : ''}`,
        startAt: new Date(start_at),
        endAt: new Date(end_at),
        partnerEmail: null,
        partnerName: 'MB Partners',
        clientEmail: app.email,
        clientName: app.name,
      })
      meetingUrl = r.meetingUrl
    } catch { /* best-effort */ }

    // 面談予約済みへ（status='applied' の間だけ成功＝二重予約防止のガード）。
    const { data: updated, error: upErr } = await admin
      .from('partner_applications')
      .update({ status: 'interview_booked', interview_at: start_at, interview_meet_url: meetingUrl })
      .eq('id', app.id)
      .eq('status', 'applied')
      .select('id')
      .maybeSingle()
    if (upErr) return NextResponse.json({ error: '予約の保存に失敗しました' }, { status: 500 })
    if (!updated) return NextResponse.json({ error: 'すでに面談が予約されています', already: true }, { status: 409 })

    const whenJa = new Date(start_at).toLocaleString('ja', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short', timeZone: 'Asia/Tokyo' })

    // 応募者へ確定メール（best-effort）。★Meetリンクの有無で文面を分岐＝リンク無し時に「上記リンクより」と矛盾させない。
    try {
      const nm = app.name ?? 'ご応募者'
      const head = `${nm} 様\n\n面談のご予約を承りました。当日はどうぞよろしくお願いいたします。\n\n・日時：${whenJa}`
      const text = meetingUrl
        ? `${head}\n・オンライン会議：${meetingUrl}\n\nお時間になりましたら、上記リンクよりご参加ください。\nご都合が変わった場合は、お手数ですが本メールへご返信ください。\n\n— MB Partners（株式会社Media Birth）`
        : `${head}\n\nオンライン会議のURLは、面談日が近づきましたら担当より改めてお送りいたします。\nご都合が変わった場合は、お手数ですが本メールへご返信ください。\n\n— MB Partners（株式会社Media Birth）`
      const { sendTemplatedEmail } = await import('@/lib/mail-send')
      await sendTemplatedEmail({
        key: 'interview-booked', to: app.email, toRole: 'invitee',
        vars: { name: nm, when: whenJa, meetingUrl: meetingUrl ?? '' },
        fallback: { subject: '【MB Partners】面談のご予約を承りました', text },
        buttons: meetingUrl ? [{ label: 'オンライン会議に参加する', url: meetingUrl }] : undefined,
        meta: { application_id: app.id },
      })
    } catch { /* best-effort */ }

    // 運営へ通知（best-effort）。Meet自動発行に失敗した場合は手動対応を促す警告を付す。
    try {
      const { sendSlack, sendOpsEmail } = await import('@/lib/notify')
      const warn = meetingUrl ? '' : '\n⚠ Meetリンクが自動発行されませんでした。Googleカレンダー連携（コンソール設定）をご確認のうえ、必要に応じて応募者へ会議URLを手動でお送りください。'
      await sendSlack(`🗓️ 面談予約: ${app.name ?? '応募者'} — ${whenJa}${meetingUrl ? `\nMeet: ${meetingUrl}` : ''}${warn}`)
      await sendOpsEmail(`【MB Partners】面談予約: ${app.name ?? '応募者'}`, `パートナー応募者が面談を予約しました。\n・お名前：${app.name ?? '—'}\n・メール：${app.email ?? '—'}\n・日時：${whenJa}${meetingUrl ? `\n・Meet：${meetingUrl}` : ''}${warn}\n\nコンソール「パートナー応募」でご確認ください。`)
    } catch { /* best-effort */ }

    return NextResponse.json({ ok: true, meetingUrl, when: whenJa })
  } catch {
    return NextResponse.json({ error: '予約に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }
}
