import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 400 })

  const supabase = await createServiceRoleClient()

  const { data: link } = await supabase
    .from('referral_links')
    .select('service_id, partner_id')
    .eq('token', token)
    .single()

  if (!link) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [{ data: service }, { data: menus }] = await Promise.all([
    supabase.from('services').select('id, name, subtitle, icon, color').eq('id', link.service_id).single(),
    supabase.from('service_menus').select('name, ref_type, ref_value, example_ref').eq('service_id', link.service_id).order('sort').limit(1),
  ])

  // 紹介者名（信頼ランディングの「{紹介者名}様からのご紹介です」表示用・read-only）。
  // ★帰属には一切不使用（帰属は POST /api/referral の link.partner_id のまま）。取得失敗時は null フォールバック。
  let referrerName: string | null = null
  try {
    if (link.partner_id) {
      const { data: partner } = await supabase.from('partners').select('profile_id').eq('id', link.partner_id).single()
      if (partner?.profile_id) {
        const { data: prof } = await supabase.from('profiles').select('name').eq('id', partner.profile_id).single()
        referrerName = prof?.name ?? null
      }
    }
  } catch { /* 表示用のみ・失敗は無視 */ }

  return NextResponse.json({ service, menu: menus?.[0] ?? null, referrerName })
}
