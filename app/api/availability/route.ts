/**
 * GET /api/availability?partner_id=<uuid>&date=YYYY-MM-DD
 * パブリックエンドポイント（認証不要）
 * 指定日のパートナーの予約可能スロット一覧を返す
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptTokens } from '@/lib/google-token'
import { getValidAccessToken, getFreeBusy, calcAvailableSlots } from '@/lib/google-calendar'
import type { StoredTokens } from '@/lib/google-token'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const partnerId = searchParams.get('partner_id')
  const date      = searchParams.get('date')   // YYYY-MM-DD

  if (!partnerId || !date) {
    return NextResponse.json({ error: 'partner_id and date are required' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  const { data: link, error: linkErr } = await supabase
    .from('calendar_links')
    .select('oauth_tokens, availability, active')
    .eq('partner_id', partnerId)
    .single()

  if (linkErr || !link) {
    return NextResponse.json({ slots: [] })
  }
  if (!link.active || !link.availability || !link.oauth_tokens) {
    return NextResponse.json({ slots: [] })
  }

  let tokens
  try {
    tokens = decryptTokens(link.oauth_tokens as StoredTokens)
  } catch {
    return NextResponse.json({ slots: [] })
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(tokens, async (refreshed) => {
      // 更新されたトークンを保存
      const { encryptTokens } = await import('@/lib/google-token')
      const updated = encryptTokens({
        access_token:  refreshed.access_token,
        refresh_token: tokens.refresh_token,
        expires_at:    refreshed.expires_at,
      })
      await supabase
        .from('calendar_links')
        .update({ oauth_tokens: updated })
        .eq('partner_id', partnerId)
    })
  } catch {
    return NextResponse.json({ slots: [] })
  }

  // 指定日の前後を含む範囲で FreeBusy 取得
  const [year, month, day] = date.split('-').map(Number)
  const timeMin = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
  const timeMax = new Date(Date.UTC(year, month - 1, day, 23, 59, 59))

  let busyBlocks
  try {
    busyBlocks = await getFreeBusy(accessToken, 'primary', timeMin, timeMax)
  } catch {
    return NextResponse.json({ slots: [] })
  }

  const slots = calcAvailableSlots(date, link.availability, busyBlocks)
  return NextResponse.json({ slots })
}
