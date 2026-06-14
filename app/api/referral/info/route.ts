import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const supabase = await createServiceRoleClient()

  const { data: link } = await supabase
    .from('referral_links')
    .select('service_id')
    .eq('token', token)
    .single()

  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [{ data: service }, { data: menus }] = await Promise.all([
    supabase.from('services').select('id, name, subtitle, icon, color').eq('id', link.service_id).single(),
    supabase.from('service_menus').select('name, ref_type, ref_value, example_ref').eq('service_id', link.service_id).order('sort').limit(1),
  ])

  return NextResponse.json({ service, menu: menus?.[0] ?? null })
}
