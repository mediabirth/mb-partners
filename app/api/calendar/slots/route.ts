/**
 * GET /api/calendar/slots
 * ログイン中パートナーが商談を入れるための空き枠を算出。
 * 基準 = MB運営の標準受付（平日10:00-18:00 / 30分枠 / 直近60日）を既定とし、
 * パートナーが受付時間帯を設定済みならそれを使用。
 * 除外 = (1) Google FreeBusy（連携時のみ） (2) 既存 deals.meeting_at（自分の予約済み）。
 * Google未連携でも必ず空き枠を返す（busy は既存予約のみ）。
 * 返却: days[{date,label,weekday,slots[],count}]（空の日も含め最大21日表示）, nextDay（最初に空きのある日）。
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptTokens, encryptTokens } from '@/lib/google-token'
import { getValidAccessToken, getFreeBusy, calcAvailableSlots, type Availability, type BusyBlock } from '@/lib/google-calendar'
import type { StoredTokens } from '@/lib/google-token'

// MB運営の標準受付（平日9:00-18:00 / 30分 / バッファ0）。③のコンソール設定で将来上書き予定。
const DEFAULT_AVAIL: Availability = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', slot_minutes: 30, buffer_minutes: 0 }
const DISPLAY_DAYS = 21   // チップ表示する日数
const HORIZON_DAYS = 60   // 空き探索の上限

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

  const { data: link } = await supabase
    .from('calendar_links')
    .select('availability, oauth_tokens, active')
    .eq('partner_id', partner.id)
    .single()

  const avail: Availability = (link?.availability as Availability) ?? DEFAULT_AVAIL
  const connected = !!(link?.active && link?.oauth_tokens)

  const now = new Date()
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60_000)

  // 除外ブロック: 既存予約(meeting_at) ＋ Google busy（連携時）
  const busy: BusyBlock[] = []

  // (1) 自分の既存予約済み案件
  const { data: booked } = await supabase
    .from('deals')
    .select('meeting_at')
    .eq('partner_id', partner.id)
    .not('meeting_at', 'is', null)
    .gte('meeting_at', now.toISOString())
  for (const d of booked ?? []) {
    const s = new Date(d.meeting_at as string)
    busy.push({ start: s.toISOString(), end: new Date(s.getTime() + 60 * 60_000).toISOString() })
  }

  // (2) Google FreeBusy（連携時のみ。失敗してもフォールバック）
  if (connected) {
    try {
      const tokens = decryptTokens(link!.oauth_tokens as StoredTokens)
      const accessToken = await getValidAccessToken(tokens, async (refreshed) => {
        const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
        await supabase.from('calendar_links').update({ oauth_tokens: updated }).eq('partner_id', partner.id)
      })
      const gbusy = await getFreeBusy(accessToken, 'primary', now, horizon)
      busy.push(...gbusy)
    } catch { /* availabilityベースで継続 */ }
  }

  const WD = ['日', '月', '火', '水', '木', '金', '土']
  const days: { date: string; label: string; weekday: string; count: number; slots: { start: string; end: string }[] }[] = []
  let nextDay: string | null = null

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60_000)
    const date = jstDateStr(d)
    let slots = calcAvailableSlots(date, avail, busy)
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
