/**
 * GET /api/availability?partner_id=<uuid>&date=YYYY-MM-DD
 * パブリック（認証不要）。指定日の予約可能スロットを返す。
 * R1①/C2①: Google未接続でも必ず既定の空き（平日9:00-18:00 / 30分枠）を提示。
 * 除外 = (1) 既存 deals.meeting_at（予約済み） (2) Google FreeBusy（連携時のみ）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptTokens, encryptTokens } from '@/lib/google-token'
import { getValidAccessToken, getFreeBusy, calcAvailableSlots, type Availability, type BusyBlock } from '@/lib/google-calendar'
import type { StoredTokens } from '@/lib/google-token'

const DEFAULT_AVAIL: Availability = { days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', slot_minutes: 30, buffer_minutes: 0 }

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const partnerId = searchParams.get('partner_id')
  const date      = searchParams.get('date')
  if (!partnerId || !date) return NextResponse.json({ error: 'partner_id and date are required' }, { status: 400 })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })

  const supabase = await createServiceRoleClient()

  const { data: link } = await supabase
    .from('calendar_links')
    .select('oauth_tokens, availability, active')
    .eq('partner_id', partnerId)
    .single()

  const avail: Availability = (link?.availability as Availability) ?? DEFAULT_AVAIL
  const connected = !!(link?.active && link?.oauth_tokens)

  const [year, month, day] = date.split('-').map(Number)
  const timeMin = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const timeMax = new Date(Date.UTC(year, month - 1, day, 23, 59, 59))

  const busy: BusyBlock[] = []

  // (1) 予約済み案件（その日）
  const { data: booked } = await supabase
    .from('deals')
    .select('meeting_at')
    .eq('partner_id', partnerId)
    .not('meeting_at', 'is', null)
    .gte('meeting_at', timeMin.toISOString())
    .lte('meeting_at', timeMax.toISOString())
  for (const d of booked ?? []) {
    const s = new Date(d.meeting_at as string)
    busy.push({ start: s.toISOString(), end: new Date(s.getTime() + 60 * 60_000).toISOString() })
  }

  // (2) Google FreeBusy（連携時のみ・失敗時はフォールバック）
  if (connected) {
    try {
      const tokens = decryptTokens(link!.oauth_tokens as StoredTokens)
      const accessToken = await getValidAccessToken(tokens, async (refreshed) => {
        const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
        await supabase.from('calendar_links').update({ oauth_tokens: updated }).eq('partner_id', partnerId)
      })
      busy.push(...await getFreeBusy(accessToken, 'primary', timeMin, timeMax))
    } catch { /* fallback */ }
  }

  let slots = calcAvailableSlots(date, avail, busy)
  const now = Date.now()
  slots = slots.filter(s => new Date(s.start).getTime() > now + 30 * 60_000)
  return NextResponse.json({ slots, connected })
}
