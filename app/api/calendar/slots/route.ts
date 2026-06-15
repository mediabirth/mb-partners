/**
 * GET /api/calendar/slots
 * ログイン中パートナーが商談を入れるための空き枠。基準＝MB運営カレンダー（mb_calendar）。
 * availability = mb_calendar 設定（既定: 平日9:00-18:00 / 30分）。
 * 除外 = (1) MB運営Googleの busy（連携時） (2) 自分の既存 deals.meeting_at (3) 祝日(no_holiday時)。
 * mb_calendar 未作成/未連携でも既定で必ず空きを返す。
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { decryptTokens, encryptTokens } from '@/lib/google-token'
import { getValidAccessToken, getFreeBusy, calcAvailableSlots, type BusyBlock } from '@/lib/google-calendar'
import type { StoredTokens } from '@/lib/google-token'
import { getMbCalendar, toAvailability, isJapaneseHoliday, MB_DEFAULTS } from '@/lib/mb-calendar'

const DISPLAY_DAYS = 21
const HORIZON_DAYS = 60

function jstDateStr(d: Date): string {
  const j = new Date(d.getTime() + 9 * 60 * 60_000)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}-${String(j.getUTCDate()).padStart(2, '0')}`
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const admin = await createServiceRoleClient()
  const mb = (await getMbCalendar(admin)) ?? MB_DEFAULTS
  const avail = toAvailability(mb)
  const connected = !!(mb.active && mb.oauth_tokens)

  const now = new Date()
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60_000)
  const busy: BusyBlock[] = []

  // (2) 自分の予約済み案件
  const { data: booked } = await supabase
    .from('deals').select('meeting_at').eq('partner_id', partner.id)
    .not('meeting_at', 'is', null).gte('meeting_at', now.toISOString())
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
    } catch { /* fallback */ }
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

  return NextResponse.json({ connected, days, nextDay })
}
