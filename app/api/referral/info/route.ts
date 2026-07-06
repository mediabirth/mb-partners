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

  // 顧客に見せるメニュー＝正典の新モデル menus（名称・短説明）。旧 service_menus.name（例:「賃貸」）は
  // パートナー非選択の先頭行が主役化する不具合の元だったため使わない。service→service_menus→menus で解決。
  const { data: service } = await supabase.from('services').select('id, name, subtitle, icon, color').eq('id', link.service_id).single()
  const { data: sm } = await supabase.from('service_menus').select('id').eq('service_id', link.service_id)
  const smIds = (sm ?? []).map(x => x.id)
  const { data: menuRows } = smIds.length
    ? await supabase.from('menus').select('id, name, short_description, sort').in('service_menu_id', smIds).eq('active', true).order('sort')
    : { data: [] as { id: string; name: string; short_description: string | null; sort: number }[] }
  const menus = (menuRows ?? []).map(m => ({ id: m.id, name: m.name, short_description: m.short_description ?? null }))

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

  // menus[]＝正典のメニュー一覧（顧客が選べる形）。単一の主役menuは返さない（構造的に非選択メニューの主役化を不可能に）。
  return NextResponse.json({ service, menus, referrerName })
}
