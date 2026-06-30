/**
 * GET /api/calendar/slots[?deal_id=<uuid>]
 * ログイン中パートナーが商談を入れるための空き枠。
 * 営業時間/枠/バッファ/祝日 = mb_calendar(id=1) の org ポリシー（組織共通）。
 * busy判定 = 段階3b：deal_id があればその deal の menu_ref→service_id→owner の担当メンバー、
 *   無ければ owner の member_calendar_links トークンで FreeBusy。★書き込み(/api/deals/[id]/meeting)と
 *   同一メンバーに解決＝空きと予約先が一致。未割当/未連携→owner(kthk.kmbr)＝従来一致・非破壊。
 * 除外 = (1) 担当メンバーGoogleの busy (2) 自分の既存 deals.meeting_at (3) 祝日(no_holiday時)。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getFreeBusy, calcAvailableSlots, type BusyBlock } from '@/lib/google-calendar'
import { getMbCalendar, toAvailability, isJapaneseHoliday, MB_DEFAULTS } from '@/lib/mb-calendar'
import { resolveBusyToken } from '@/lib/mb-calendar-event'

const DISPLAY_DAYS = 21
const HORIZON_DAYS = 60

function jstDateStr(d: Date): string {
  const j = new Date(d.getTime() + 9 * 60 * 60_000)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const admin = await createServiceRoleClient()
  const mb = (await getMbCalendar(admin)) ?? MB_DEFAULTS
  const avail = toAvailability(mb)

  // busy基準＝担当メンバー解決。deal_id があればその deal の menu/service から（書き込みと同一）。
  const dealId = new URL(req.url).searchParams.get('deal_id')
  let menuRef: string | null = null
  let serviceId: string | null = null
  if (dealId) {
    const { data: deal } = await admin.from('deals').select('menu_ref, service_id').eq('id', dealId).eq('partner_id', partner.id).single()
    menuRef = (deal as { menu_ref?: string | null } | null)?.menu_ref ?? null
    serviceId = (deal as { service_id?: string | null } | null)?.service_id ?? null
  }
  const bt = await resolveBusyToken(admin, { menuRef, serviceId })
  const connected = !!bt

  const now = new Date()
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60_000)
  const busy: BusyBlock[] = []
  let busyChecked = false   // 担当メンバーの getFreeBusy が成功したか（false＝fail-open）。

  // (2) 自分の予約済み案件
  const { data: booked } = await supabase
    .from('deals').select('meeting_at').eq('partner_id', partner.id)
    .not('meeting_at', 'is', null).gte('meeting_at', now.toISOString())
  for (const d of booked ?? []) {
    const s = new Date(d.meeting_at as string)
    busy.push({ start: s.toISOString(), end: new Date(s.getTime() + 60 * 60_000).toISOString() })
  }

  // (1) 担当メンバーGoogleの busy
  if (bt) {
    try { busy.push(...await getFreeBusy(bt.accessToken, bt.calendarId, now, horizon)); busyChecked = true } catch { /* fail-open */ }
  }

  const WD = ['日', '月', '火', '水', '木', '金', '土']
  const days: { date: string; label: string; weekday: string; count: number; slots: { start: string; end: string }[] }[] = []
  let nextDay: string | null = null

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60_000)
    const date = jstDateStr(d)
    let slots = (mb.no_holiday && isJapaneseHoliday(date)) ? [] : calcAvailableSlots(date, avail, busy)
    if (i === 0) slots = slots.filter(s => new Date(s.start).getTime() > now.getTime() + 30 * 60_000)
    if (!nextDay && slots.length > 0) nextDay = date
    if (i < DISPLAY_DAYS) {
      const jd = new Date(d.getTime() + 9 * 60 * 60_000)
      days.push({ date, label: `${jd.getUTCMonth() + 1}/${jd.getUTCDate()}`, weekday: WD[jd.getUTCDay()], count: slots.length, slots })
    }
    if (nextDay && i >= DISPLAY_DAYS) break
  }

  return NextResponse.json({ connected, busyChecked, days, nextDay })
}
