import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Wave1-④a：partner本人の Web Push 購読を保存（RLS=本人のみ insert/update。お金/案件状態に非接触）。
export const runtime = 'edge'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { endpoint, p256dh, auth } = await req.json().catch(() => ({}))
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: 'invalid subscription' }, { status: 400 })

  // partner本人の id を解決（RLS の with_check と一致させる）。
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  // upsert（同一 endpoint は enabled を戻す）。anon クライアント＝RLS が partner本人を保証。
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({ partner_id: partner.id, endpoint, p256dh, auth, enabled: true }, { onConflict: 'partner_id,endpoint' })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true })
}
