import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

// Wave1-⑤：紹介ファネル計測の公開受け口（additive・fire-and-forget前提）。
// token→partner_id は「読み取りのみ」で解決（既存の帰属/解決ロジックは改変せず別参照）。
// 失敗してもUXを止めない＝常に 200 を返す。お金・帰属・status には一切触れない。
export const runtime = 'edge'

const VALID_EVENTS = new Set(['share', 'landing_view'])
const VALID_CHANNELS = new Set(['mail', 'line', 'copy', 'qr'])

export async function POST(req: NextRequest) {
  try {
    const { event_type, token, channel } = await req.json().catch(() => ({}))
    if (!VALID_EVENTS.has(event_type)) return NextResponse.json({ ok: true, skipped: 'invalid event' })

    const tok = typeof token === 'string' ? token.slice(0, 64) : null
    const ch = typeof channel === 'string' && VALID_CHANNELS.has(channel) ? channel : null

    const admin = await createServiceRoleClient()

    // token→partner_id を読み取りのみで解決（referral_links を参照するだけ・既存ロジック不変）。
    let partnerId: string | null = null
    if (tok) {
      const { data: link } = await admin.from('referral_links').select('partner_id').eq('token', tok).maybeSingle()
      partnerId = link?.partner_id ?? null
    }

    // 簡易重複抑制：同一 (event_type, token, channel) が直近10秒にあればスキップ（指標の二重計上防止・最小防御）。
    const dedupHash = `${event_type}:${tok ?? ''}:${ch ?? ''}`
    const since = new Date(Date.now() - 10_000).toISOString()
    const { data: recent } = await admin
      .from('funnel_events')
      .select('id')
      .eq('dedup_hash', dedupHash)
      .gte('created_at', since)
      .limit(1)
    if ((recent?.length ?? 0) > 0) return NextResponse.json({ ok: true, deduped: true })

    await admin.from('funnel_events').insert({
      event_type, channel: ch, token: tok, partner_id: partnerId, dedup_hash: dedupHash,
    })
    return NextResponse.json({ ok: true })
  } catch {
    // 計測失敗は UX を止めない。
    return NextResponse.json({ ok: true, error: 'swallowed' })
  }
}
