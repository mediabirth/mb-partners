/**
 * GET /api/availability?partner_id=<uuid>&date=YYYY-MM-DD
 * パブリック（認証不要）。指定日の予約可能スロット。基準＝MB運営カレンダー（mb_calendar）。
 * availability = mb_calendar 設定（既定: 平日9:00-18:00 / 30分）。
 * 除外 = (1) MB運営Googleの busy（連携時） (2) 当該パートナーの既存 deals.meeting_at (3) 祝日(no_holiday時)。
 * mb_calendar 未作成/未連携でも必ず既定の空きを返す。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptTokens, encryptTokens } from '@/lib/google-token'
import { getValidAccessToken, getFreeBusy, calcAvailableSlots, type BusyBlock } from '@/lib/google-calendar'
import type { StoredTokens } from '@/lib/google-token'
import { getMbCalendar, toAvailability, isJapaneseHoliday, MB_DEFAULTS } from '@/lib/mb-calendar'

const RANGE_DISPLAY_DAYS = 21
const RANGE_HORIZON_DAYS = 60
const WD = ['日', '月', '火', '水', '木', '金', '土']

function jstDateStr(d: Date): string {
  const j = new Date(d.getTime() + 9 * 60 * 60_000)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`
}

/**
 * 範囲取得（additive・後方互換）：複数日の空き枠を枠数付き days[] で返す。
 * 予約可否計算（mb_calendar busy除外・当該パートナーの meeting_at除外・祝日）は単日パスと同一ロジック。
 * /api/calendar/slots と同じ days[] 整形（label/weekday/count/slots, nextDay）。
 */
async function rangeAvailability(partnerId: string, displayDays: number) {
  const admin = await createServiceRoleClient()
  const mb = (await getMbCalendar(admin)) ?? MB_DEFAULTS
  const avail = toAvailability(mb)
  const connected = !!(mb.active && mb.oauth_tokens)

  const now = new Date()
  const horizon = new Date(now.getTime() + RANGE_HORIZON_DAYS * 24 * 60 * 60_000)
  const busy: BusyBlock[] = []
  let busyChecked = false   // 連携時に getFreeBusy が実際に成功したか（false＝fail-open）。

  // (2) 当該パートナーの予約済み案件（範囲内）
  const { data: booked } = await admin
    .from('deals').select('meeting_at').eq('partner_id', partnerId)
    .not('meeting_at', 'is', null).gte('meeting_at', now.toISOString()).lte('meeting_at', horizon.toISOString())
  for (const d of booked ?? []) {
    const s = new Date(d.meeting_at as string)
    busy.push({ start: s.toISOString(), end: new Date(s.getTime() + 60 * 60_000).toISOString() })
  }

  // (1) MB運営Googleの busy（連携時）
  if (connected) {
    try {
      const tokens = decryptTokens(mb.oauth_tokens as StoredTokens)
      const accessToken = await getValidAccessToken(tokens, async (refreshed) => {
        const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
        await admin.from('mb_calendar').update({ oauth_tokens: updated }).eq('id', 1)
      })
      busy.push(...await getFreeBusy(accessToken, 'primary', now, horizon))
      busyChecked = true
    } catch { /* fallback：busyChecked=false のまま＝可視化 */ }
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
  // 範囲取得（additive）：days指定かつ date無指定のときだけ複数日 days[] を返す。
  // date指定（既存呼び出し）時は以降の単日パスを完全維持（byte-unchanged）。
  if (partnerId && daysParam && !date) return rangeAvailability(partnerId, parseInt(daysParam, 10) || RANGE_DISPLAY_DAYS)
  if (!partnerId || !date) return NextResponse.json({ error: 'partner_id and date are required' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const mb = (await getMbCalendar(admin)) ?? MB_DEFAULTS
  const avail = toAvailability(mb)
  const connected = !!(mb.active && mb.oauth_tokens)

  // 祝日は枠なし
  if (mb.no_holiday && isJapaneseHoliday(date)) return NextResponse.json({ slots: [], connected })

  const [year, month, day] = date.split('-').map(Number)
  const timeMin = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const timeMax = new Date(Date.UTC(year, month - 1, day, 23, 59, 59))
  const busy: BusyBlock[] = []
  let busyChecked = false   // 連携時に getFreeBusy が実際に成功したか（false＝fail-open＝MB運営カレンダーの再連携が必要）。

  // (2) 当該パートナーの予約済み案件（その日）
  const { data: booked } = await admin
    .from('deals').select('meeting_at').eq('partner_id', partnerId)
    .not('meeting_at', 'is', null).gte('meeting_at', timeMin.toISOString()).lte('meeting_at', timeMax.toISOString())
  for (const d of booked ?? []) {
    const s = new Date(d.meeting_at as string)
    busy.push({ start: s.toISOString(), end: new Date(s.getTime() + 60 * 60_000).toISOString() })
  }

  // (1) MB運営Googleの busy（連携時）
  if (connected) {
    try {
      const tokens = decryptTokens(mb.oauth_tokens as StoredTokens)
      const accessToken = await getValidAccessToken(tokens, async (refreshed) => {
        const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
        await admin.from('mb_calendar').update({ oauth_tokens: updated }).eq('id', 1)
      })
      busy.push(...await getFreeBusy(accessToken, 'primary', timeMin, timeMax))
      busyChecked = true
    } catch { /* fallback：トークン失効/復号失敗等。busyChecked=false のまま＝可視化 */ }
  }

  let slots = calcAvailableSlots(date, avail, busy)
  const now = Date.now()
  slots = slots.filter(s => new Date(s.start).getTime() > now + 30 * 60_000)
  return NextResponse.json({ slots, connected, busyChecked })
}
