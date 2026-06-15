/**
 * GET /api/calendar/slots
 * ログイン中パートナー自身の空き枠を算出して返す（in-app 商談設定用）。
 * - 受付時間帯(availability)＋Google FreeBusy（連携済みのみ）から calcAvailableSlots。
 * - 今日〜14日先まで。空き枠のある最初の日を nextDay として返す。
 * - Google未連携でも availability ベースで空き枠を返す（busy=空）。
 */
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { decryptTokens, encryptTokens } from '@/lib/google-token'
import { getValidAccessToken, getFreeBusy, calcAvailableSlots, type Availability, type BusyBlock } from '@/lib/google-calendar'
import type { StoredTokens } from '@/lib/google-token'

// crypto(node) を使うため nodejs ランタイム（既存 /api/meetings と同様）
const DEFAULT_AVAIL: Availability = { days: [1, 2, 3, 4, 5], start: '10:00', end: '18:00', slot_minutes: 60, buffer_minutes: 15 }

function jstDateStr(d: Date): string {
  // JST(UTC+9) の YYYY-MM-DD
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
    .select('availability, oauth_tokens, google_email, active')
    .eq('partner_id', partner.id)
    .single()

  const avail: Availability = (link?.availability as Availability) ?? DEFAULT_AVAIL
  const connected = !!(link?.active && link?.oauth_tokens)

  const now = new Date()
  const horizon = new Date(now.getTime() + 14 * 24 * 60 * 60_000)

  // Google 連携時は FreeBusy をまとめて取得（失敗しても availability ベースで継続）
  let busy: BusyBlock[] = []
  if (connected) {
    try {
      const tokens = decryptTokens(link!.oauth_tokens as StoredTokens)
      const accessToken = await getValidAccessToken(tokens, async (refreshed) => {
        const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
        await supabase.from('calendar_links').update({ oauth_tokens: updated }).eq('partner_id', partner.id)
      })
      busy = await getFreeBusy(accessToken, 'primary', now, horizon)
    } catch {
      busy = [] // 連携エラー時は受付時間帯ベースにフォールバック
    }
  }

  const days: { date: string; label: string; slots: { start: string; end: string }[] }[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() + i * 24 * 60 * 60_000)
    const date = jstDateStr(d)
    let slots = calcAvailableSlots(date, avail, busy)
    // 今日は現在時刻より後のスロットのみ
    if (i === 0) slots = slots.filter(s => new Date(s.start).getTime() > now.getTime() + 30 * 60_000)
    if (slots.length === 0) continue
    const jd = new Date(d.getTime() + 9 * 60 * 60_000)
    const label = `${jd.getUTCMonth() + 1}/${jd.getUTCDate()}(${['日', '月', '火', '水', '木', '金', '土'][jd.getUTCDay()]})`
    days.push({ date, label, slots })
  }

  return NextResponse.json({ connected, days, nextDay: days[0]?.date ?? null })
}
