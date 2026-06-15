/**
 * POST /api/deals/[id]/meeting
 * パートナーが自分の案件に商談日時を設定（in-app）。
 * - Google連携時はカレンダーにイベント作成 → calendar_event_id を保存。
 * - deals.meeting_at / deals.calendar_event_id を更新。
 * - 未連携でも meeting_at は保存（event_id は null）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { decryptTokens, encryptTokens } from '@/lib/google-token'
import { getValidAccessToken, createCalendarEvent } from '@/lib/google-calendar'
import type { StoredTokens } from '@/lib/google-token'

// crypto(node) を使うため nodejs ランタイム
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { start_at, end_at } = await req.json()
  if (!start_at || !end_at) return NextResponse.json({ error: 'start_at and end_at required' }, { status: 400 })

  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  // 案件は本人のものに限定
  const { data: deal } = await supabase
    .from('deals')
    .select('id, customer_name, partner_id, service_id')
    .eq('id', id)
    .eq('partner_id', partner.id)
    .single()
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })

  const { data: profile } = await supabase.from('profiles').select('name, email').eq('id', user.id).single()

  // Google 連携時のみイベント作成（失敗しても meeting_at は保存）
  let eventId: string | null = null
  const { data: link } = await supabase
    .from('calendar_links')
    .select('oauth_tokens, google_email, active')
    .eq('partner_id', partner.id)
    .single()

  if (link?.active && link.oauth_tokens) {
    try {
      const tokens = decryptTokens(link.oauth_tokens as StoredTokens)
      const accessToken = await getValidAccessToken(tokens, async (refreshed) => {
        const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
        await supabase.from('calendar_links').update({ oauth_tokens: updated }).eq('partner_id', partner.id)
      })
      eventId = await createCalendarEvent(accessToken, {
        summary:      `${deal.customer_name} 商談`,
        description:  `${profile?.name ?? 'パートナー'} の案件商談`,
        startAt:      new Date(start_at),
        endAt:        new Date(end_at),
        partnerEmail: link.google_email ?? profile?.email ?? '',
        clientEmail:  profile?.email ?? '',
        partnerName:  profile?.name ?? '',
        clientName:   deal.customer_name,
      })
    } catch {
      eventId = null // 連携エラー時は meeting_at のみ保存
    }
  }

  // 所有確認は上の authed select 済み。UPDATE は RLS を回避するため service role で実施。
  const admin = await createServiceRoleClient()
  const { error } = await admin
    .from('deals')
    .update({ meeting_at: start_at, calendar_event_id: eventId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('partner_id', partner.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // C2④ パートナー本人へ商談予約の受付確認メール（ベストエフォート）
  try {
    if (profile?.email) {
      const { data: svc } = await supabase.from('services').select('name').eq('id', (deal as { service_id?: string }).service_id ?? '').single()
      const { sendReceiptEmail } = await import('@/lib/email')
      await sendReceiptEmail({
        to: profile.email,
        partnerName: profile.name,
        kind: 'meeting',
        customerName: deal.customer_name,
        serviceName: svc?.name ?? null,
        meetingAt: start_at,
      })
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, meeting_at: start_at, calendar_event_id: eventId, googleSynced: !!eventId })
}
