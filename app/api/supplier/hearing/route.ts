/**
 * サプライヤーの案件ヒアリング参照（読み取り専用・自社案件のみ）— vendor-redesign後続①。
 * GET ?deal_id= — 自社メニューの案件に定義された項目＋回答（面公開境界: supplier本人×自社案件のみ・書込なし）
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: p } = await supabase.from('partners').select('id, supplier_rate_card').eq('profile_id', user.id).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  if (!p.supplier_rate_card) {
    const { data: sv } = await admin.from('services').select('id').eq('supplier_partner_id', p.id).limit(1)
    if (!sv?.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const dealId = new URL(req.url).searchParams.get('deal_id')
  if (!dealId) return NextResponse.json({ error: 'deal_id は必須です' }, { status: 400 })
  const { data: dl } = await admin.from('deals').select('id, service_id, menu_id, reward_snapshot').eq('id', dealId).maybeSingle()
  if (!dl) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: own } = await admin.from('services').select('id').eq('id', dl.service_id as string).eq('supplier_partner_id', p.id).maybeSingle()
  if (!own) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { resolveMenuIdForDeal } = await import('@/lib/hearing')
  const menuId = await resolveMenuIdForDeal(admin, dealId)
  if (!menuId) return NextResponse.json({ items: [] })
  const [{ data: items }, { data: ans }] = await Promise.all([
    admin.from('menu_hearing_items').select('id, label, sort').eq('menu_id', menuId).eq('active', true).order('sort'),
    admin.from('deal_hearing_answers').select('item_id, value').eq('deal_id', dealId),
  ])
  const valueBy = Object.fromEntries(((ans ?? []) as { item_id: string; value: string | null }[]).map(a => [a.item_id, a.value ?? '']))
  return NextResponse.json({ items: ((items ?? []) as { id: string; label: string }[]).map(it => ({ label: it.label, value: valueBy[it.id] ?? '' })) })
}
