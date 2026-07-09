/**
 * GET /api/partners/interview/[token]/availability
 * パートナー応募者の面談予約用・空き枠（公開・認証不要／interview_token が鍵）。
 * 営業時間/枠 = mb_calendar(id=1) の org ポリシー。busy = オーナー(面談担当)のGoogle FreeBusy＋既に予約済みの面談。
 * ★money/deals/auth 非接触。partner_applications と mb_calendar のみ参照。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getFreeBusy, calcAvailableSlots, type BusyBlock } from '@/lib/google-calendar'
import { getMbCalendar, toAvailability, isJapaneseHoliday, MB_DEFAULTS } from '@/lib/mb-calendar'
import { resolveBusyToken } from '@/lib/mb-calendar-event'

const DISPLAY_DAYS = 21
const HORIZON_DAYS = 60
const WD = ['日', '月', '火', '水', '木', '金', '土']

function jstDateStr(d: Date): string {
  const j = new Date(d.getTime() + 9 * 60 * 60_000)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[0-9a-fA-F-]{36}$/.test(token)) return NextResponse.json({ error: 'invalid token' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const { data: app } = await admin
    .from('partner_applications')
    .select('id, name, status, interview_at, interview_meet_url')
    .eq('interview_token', token)
    .maybeSingle()
  if (!app) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // 既に予約済み/承認/見送りなら枠は返さず状態のみ返す（二重予約防止）。
  if (app.status !== 'applied') {
    return NextResponse.json({ name: app.name, status: app.status, interview_at: app.interview_at, meetingUrl: app.interview_meet_url, days: [], nextDay: null })
  }

  const mb = (await getMbCalendar(admin)) ?? MB_DEFAULTS
  const avail = toAvailability(mb)
  const now = new Date()
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60_000)
  const busy: BusyBlock[] = []
  let busyChecked = false

  // (1) 既に予約済みの面談を busy として除外（二重予約防止・カレンダー非依存で確実）
  const { data: booked } = await admin
    .from('partner_applications').select('interview_at')
    .not('interview_at', 'is', null).gte('interview_at', now.toISOString()).lte('interview_at', horizon.toISOString())
  for (const r of booked ?? []) {
    const s = new Date(r.interview_at as string)
    busy.push({ start: s.toISOString(), end: new Date(s.getTime() + 30 * 60_000).toISOString() })
  }

  // (2) 面談担当（オーナー）のGoogle busy（best-effort・未連携/復号失敗はfail-open＝枠は出す）
  let connected = false
  try {
    const bt = await resolveBusyToken(admin, { menuRef: null, serviceId: null })
    connected = !!bt
    if (bt) { busy.push(...await getFreeBusy(bt.accessToken, bt.calendarId, now, horizon)); busyChecked = true }
  } catch { /* トークン復号失敗/未連携でもクラッシュさせず枠は返す */ }

  const days: { date: string; label: string; weekday: string; count: number; slots: { start: string; end: string }[] }[] = []
  let nextDay: string | null = null
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60_000)
    const date = jstDateStr(d)
    let slots = (mb.no_holiday && isJapaneseHoliday(date)) ? [] : calcAvailableSlots(date, avail, busy)
    if (i === 0) slots = slots.filter(s => new Date(s.start).getTime() > now.getTime() + 60 * 60_000)
    if (!nextDay && slots.length > 0) nextDay = date
    if (i < DISPLAY_DAYS) {
      const jd = new Date(d.getTime() + 9 * 60 * 60_000)
      days.push({ date, label: `${jd.getUTCMonth() + 1}/${jd.getUTCDate()}`, weekday: WD[jd.getUTCDay()], count: slots.length, slots })
    }
    if (nextDay && i >= DISPLAY_DAYS) break
  }

  return NextResponse.json({ name: app.name, status: app.status, connected, busyChecked, days, nextDay })
}
