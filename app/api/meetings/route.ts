/**
 * POST /api/meetings
 * 予約確定：calendar_links の oauth_tokens を使って Google Calendar にイベントを作成し、
 * meetings テーブルに保存する（サービスロール使用 — 公開エンドポイント）
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { decryptTokens, encryptTokens } from '@/lib/google-token'
import { getValidAccessToken, createCalendarEvent } from '@/lib/google-calendar'
import { createNotification } from '@/lib/notifications'
import type { StoredTokens } from '@/lib/google-token'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { partner_id, start_at, end_at, client_name, client_email } = body

  if (!partner_id || !start_at || !end_at || !client_name || !client_email) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()

  // パートナー情報取得（name/email は profiles から）
  const { data: partner } = await supabase
    .from('partners')
    .select('id, profile_id')
    .eq('id', partner_id)
    .single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', partner.profile_id)
    .single()

  // calendar_links 取得
  const { data: link } = await supabase
    .from('calendar_links')
    .select('id, oauth_tokens, google_email, active')
    .eq('partner_id', partner_id)
    .single()
  if (!link || !link.active || !link.oauth_tokens) {
    return NextResponse.json({ error: 'Calendar not connected' }, { status: 400 })
  }

  let tokens
  try {
    tokens = decryptTokens(link.oauth_tokens as StoredTokens)
  } catch {
    return NextResponse.json({ error: 'Token decryption failed' }, { status: 500 })
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(tokens, async (refreshed) => {
      const updated = encryptTokens({
        access_token:  refreshed.access_token,
        refresh_token: tokens.refresh_token,
        expires_at:    refreshed.expires_at,
      })
      await supabase
        .from('calendar_links')
        .update({ oauth_tokens: updated })
        .eq('partner_id', partner_id)
    })
  } catch {
    return NextResponse.json({ error: 'Token refresh failed' }, { status: 500 })
  }

  // Google Calendar にイベント作成
  let googleEventId: string | null = null
  try {
    googleEventId = await createCalendarEvent(accessToken, {
      summary:      `${profile?.name ?? 'パートナー'} × ${client_name} 相談`,
      description:  `予約者: ${client_name} (${client_email})`,
      startAt:      new Date(start_at),
      endAt:        new Date(end_at),
      partnerEmail: link.google_email ?? profile?.email ?? '',
      clientEmail:  client_email,
      partnerName:  profile?.name ?? '',
      clientName:   client_name,
    })
  } catch (e: any) {
    console.error('[meetings] createCalendarEvent error:', e.message)
    // イベント作成失敗でも予約は保存する
  }

  // meetings テーブルに保存
  const { data: meeting, error: insertErr } = await supabase
    .from('meetings')
    .insert({
      partner_id,
      calendar_link_id: link.id,
      start_at,
      end_at,
      client_name,
      client_email,
      status:           'booked',
      google_event_id:  googleEventId,
    })
    .select('id')
    .single()

  if (insertErr) {
    console.error('[meetings] insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  // パートナーに予約通知
  const startJST = new Date(start_at).toLocaleString('ja', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  })
  await createNotification(
    supabase,
    partner_id,
    '新しい予約が入りました',
    `${client_name} — ${startJST}`,
    { type: 'meeting', id: meeting.id },
  )

  return NextResponse.json({ meeting_id: meeting.id }, { status: 201 })
}
