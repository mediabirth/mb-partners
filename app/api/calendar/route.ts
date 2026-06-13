/**
 * GET  /api/calendar  — パートナー自身の calendar_links レコードを返す
 * PATCH /api/calendar — availability を更新する
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await supabase
    .from('calendar_links')
    .select('id, partner_id, google_email, active, availability, service_ids')
    .eq('partner_id', partner.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ link: data ?? null })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { availability } = body

  if (!availability) {
    return NextResponse.json({ error: 'availability is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('calendar_links')
    .update({ availability })
    .eq('partner_id', partner.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
