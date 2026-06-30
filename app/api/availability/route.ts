/**
 * GET /api/availability?partner_id=<uuid>&date=YYYY-MM-DD[&service_id=&menu_ref=]
 * パブリック（認証不要）。指定日の予約可能スロット。
 * 営業時間/枠/バッファ/祝日 = mb_calendar(id=1) の org ポリシー（組織共通）。
 * busy判定 = 段階3b：予約対象（menu_ref→service_id→既定owner）の担当メンバーの member_calendar_links
 *   トークンで FreeBusy。★書き込み(createCentralMeetEvent)と同一解決＝空きと予約先が一致。
 *   未割当/未連携 → owner(kthk.kmbr) 基準（従来と一致・非破壊）。
 * 除外 = (1) 担当メンバーGoogleの busy (2) 当該パートナーの既存 deals.meeting_at (3) 祝日(no_holiday時)。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { getFreeBusy, calcAvailableSlots, type BusyBlock } from '@/lib/google-calendar'
import { getMbCalendar, toAvailability, isJapaneseHoliday, MB_DEFAULTS } from '@/lib/mb-calendar'
import { resolveBusyToken } from '@/lib/mb-calendar-event'

const RANGE_DISPLAY_DAYS = 21
const RANGE_HORIZON_DAYS = 60
const WD = ['日', '月', '火', '水', '木', '金', '土']

function jstDateStr(d: Date): string {
  const j = new Date(d.getTime() + 9 * 60 * 60_000)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`
}

/**
 * 範囲取得（additive・後方互換）：複数日の空き枠を枠数付き days[] で返す。
 * busy基準＝担当メンバー解決（menu→service→owner）。単日パスと同一ロジック。
 */
async function rangeAvailability(partnerId: string, displayDays: number, menuRef: string | null, serviceId: string | null) {
  const admin = await createServiceRoleClient()
  const mb = (await getMbCalendar(admin)) ?? MB_DEFAULTS
  const avail = toAvailability(mb)

  const now = new Date()
  const horizon = new Date(now.getTime() + RANGE_HORIZON_DAYS * 24 * 60 * 60_000)
  const busy: BusyBlock[] = []
  let busyChecked = false   // 担当メンバーの getFreeBusy が成功したか（false＝fail-open）。

  // (2) 当該パートナーの予約済み案件（範囲内）
  const { data: booked } = await admin
    .from('deals').select('meeting_at').eq('partner_id', partnerId)
    .not('meeting_at', 'is', null).gte('meeting_at', now.toISOString()).lte('meeting_at', horizon.toISOString())
  for (const d of booked ?? []) {
    const s = new Date(d.meeting_at as string)
    busy.push({ start: s.toISOString(), end: new Date(s.getTime() + 60 * 60_000).toISOString() })
  }

  // (1) 担当メンバー（menu→service→owner）のGoogle busy
  const bt = await resolveBusyToken(admin, { menuRef, serviceId })
  const connected = !!bt
  if (bt) {
    try { busy.push(...await getFreeBusy(bt.accessToken, bt.calendarId, now, horizon)); busyChecked = true } catch { /* fail-open */ }
  }

  const cap = Math.min(Math.max(displayDays, 1), RANGE_DISPLAY_DAYS)
  const days: { date: string; label: string; weekday: string; count: number; slots: { start: string; end: string }[] }[] = []
  let nextDay: string | null = null

  for (let i = 0; i < RANGE_HORIZON_DAYS; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60_000)
    const date = jstDateStr(d)
    let slots = (mb.no_holiday && isJapaneseHoliday(date)) ? [] : calcAvailableSlots(date, avail, busy)
    if (i === 0) slots = slots.filter(s => new Date(s.start).getTime() > now.getTime() + 30 * 60_000)
    if (!nextDay && slots.length > 0) nextDay = date
    if (i < cap) {
      const jd = new Date(d.getTime() + 9 * 60 * 60_000)
      days.push({ date, label: `${jd.getUTCMonth() + 1}/${jd.getUTCDate()}`, weekday: WD[jd.getUTCDay()], count: slots.length, slots })
    }
    if (nextDay && i >= cap) break
  }

  return NextResponse.json({ connected, busyChecked, days, nextDay })
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const partnerId = searchParams.get('partner_id')
  const date      = searchParams.get('date')
  const daysParam = searchParams.get('days')
  const menuRef   = searchParams.get('menu_ref')
  const serviceId = searchParams.get('service_id')
  // 範囲取得（additive）：days指定かつ date無指定のときだけ複数日 days[] を返す。
  if (partnerId && daysParam && !date) return rangeAvailability(partnerId, parseInt(daysParam, 10) || RANGE_DISPLAY_DAYS, menuRef, serviceId)
  if (!partnerId || !date) return NextResponse.json({ error: 'partner_id and date are required' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const mb = (await getMbCalendar(admin)) ?? MB_DEFAULTS
  const avail = toAvailability(mb)

  // busy基準＝担当メンバー解決（書き込みと同一）。未割当/未連携→owner。
  const bt = await resolveBusyToken(admin, { menuRef, serviceId })
  const connected = !!bt

  // 祝日は枠なし
  if (mb.no_holiday && isJapaneseHoliday(date)) return NextResponse.json({ slots: [], connected })

  const [year, month, day] = date.split('-').map(Number)
  const timeMin = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const timeMax = new Date(Date.UTC(year, month - 1, day, 23, 59, 59))
  const busy: BusyBlock[] = []
  let busyChecked = false

  // (2) 当該パートナーの予約済み案件（その日）
  const { data: booked } = await admin
    .from('deals').select('meeting_at').eq('partner_id', partnerId)
    .not('meeting_at', 'is', null).gte('meeting_at', timeMin.toISOString()).lte('meeting_at', timeMax.toISOString())
  for (const d of booked ?? []) {
    const s = new Date(d.meeting_at as string)
    busy.push({ start: s.toISOString(), end: new Date(s.getTime() + 60 * 60_000).toISOString() })
  }

  // (1) 担当メンバーGoogleの busy
  if (bt) {
    try { busy.push(...await getFreeBusy(bt.accessToken, bt.calendarId, timeMin, timeMax)); busyChecked = true } catch { /* fail-open */ }
  }

  let slots = calcAvailableSlots(date, avail, busy)
  const now = Date.now()
  slots = slots.filter(s => new Date(s.start).getTime() > now + 30 * 60_000)
  return NextResponse.json({ slots, connected, busyChecked })
}
