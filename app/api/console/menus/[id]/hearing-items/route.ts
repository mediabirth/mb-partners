/**
 * メニュー別ヒアリング項目の定義（サービスマスタ・owner/manager）— vendor-redesign後続①。
 * GET  — 項目一覧（sort順・inactive含む）
 * PUT  { items: [{ id?, label, input_type, options?, required, sort, active }] } — set-semantics（差分upsert＋一覧に無いidは削除）
 * ★報酬計算・money系（menu_rewards/deals/charges）には一切非接続＝ヒアリングは記録専用。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
const TYPES = ['text', 'number', 'select']

async function requireOps(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireOps(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data } = await admin.from('menu_hearing_items').select('id, label, input_type, options, required, sort, active').eq('menu_id', id).order('sort')
  return NextResponse.json({ items: data ?? [] })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireOps(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: menu } = await admin.from('menus').select('id').eq('id', id).maybeSingle()
  if (!menu) return NextResponse.json({ error: 'メニューが見つかりません' }, { status: 404 })
  const b = await req.json().catch(() => ({}))
  const items = Array.isArray(b.items) ? b.items as { id?: string; label?: string; input_type?: string; options?: unknown; required?: boolean; sort?: number; active?: boolean }[] : null
  if (!items) return NextResponse.json({ error: 'items は必須です' }, { status: 400 })
  if (items.length > 30) return NextResponse.json({ error: '項目は30件までです' }, { status: 400 })
  for (const it of items) {
    if (!String(it.label ?? '').trim()) return NextResponse.json({ error: '項目名が空の行があります' }, { status: 400 })
    if (it.input_type && !TYPES.includes(it.input_type)) return NextResponse.json({ error: '不正な型です' }, { status: 400 })
  }
  const { data: cur } = await admin.from('menu_hearing_items').select('id').eq('menu_id', id)
  const keep = new Set(items.map(i => i.id).filter(Boolean))
  const drop = ((cur ?? []) as { id: string }[]).filter(c => !keep.has(c.id)).map(c => c.id)
  if (drop.length) {
    // 回答が残る項目は消さず inactive（過去案件の記録を保全）
    const { data: answered } = await admin.from('deal_hearing_answers').select('item_id').in('item_id', drop)
    const answeredSet = new Set(((answered ?? []) as { item_id: string }[]).map(a => a.item_id))
    const hardDrop = drop.filter(d => !answeredSet.has(d))
    const softDrop = drop.filter(d => answeredSet.has(d))
    if (hardDrop.length) await admin.from('menu_hearing_items').delete().in('id', hardDrop)
    if (softDrop.length) await admin.from('menu_hearing_items').update({ active: false }).in('id', softDrop)
  }
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const row = { menu_id: id, label: String(it.label).trim().slice(0, 80), input_type: TYPES.includes(it.input_type ?? '') ? it.input_type : 'text', options: it.options ?? null, required: !!it.required, sort: Number.isFinite(it.sort) ? Number(it.sort) : i, active: it.active !== false }
    if (it.id) await admin.from('menu_hearing_items').update(row).eq('id', it.id).eq('menu_id', id)
    else await admin.from('menu_hearing_items').insert(row)
  }
  const { data } = await admin.from('menu_hearing_items').select('id, label, input_type, options, required, sort, active').eq('menu_id', id).order('sort')
  return NextResponse.json({ items: data ?? [] })
}
