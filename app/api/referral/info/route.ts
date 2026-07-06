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

  // 第3稿: 顧客の目のページ＝サービス自身の相談ページ。紹介の機構は透けさせない。
  //   顧客向けテキストは menus.public_description（顧客専用の言葉の置き場）のみ使用。
  //   パートナー向けの short_description/description・紹介者名は顧客面に一切流用しない（返さない）。
  const { data: service } = await supabase.from('services').select('id, name, icon, color, image_url').eq('id', link.service_id).single()
  const { data: sm } = await supabase.from('service_menus').select('id').eq('service_id', link.service_id)
  const smIds = (sm ?? []).map(x => x.id)
  const { data: menuRows } = smIds.length
    ? await supabase.from('menus').select('id, name, public_description, sort').in('service_menu_id', smIds).eq('active', true).order('sort')
    : { data: [] as { id: string; name: string; public_description: string | null; sort: number }[] }
  const menus = (menuRows ?? []).map(m => ({ id: m.id, name: m.name, public_description: m.public_description ?? null }))

  // menus[]＝正典のメニュー一覧（顧客が選べる形）。単一の主役menuは返さない（非選択メニューの主役化を構造的に不可能に）。
  // 紹介者名・partner_id は顧客面に不要のため返さない（帰属は POST /api/referral の token のまま不変）。
  return NextResponse.json({ service, menus })
}
