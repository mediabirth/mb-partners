/**
 * サプライヤー詳細（Feature I）。GET=詳細／PATCH=レートカード付け替え（履歴付き）・契約停止/再開。
 * ★付け替えは「以後に確定する案件」からのみ適用（凍結済みfee_snapshot/supplier_chargesは不変＝構造保証）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { STD_RATE_CARD } from '@/lib/supplier-fee'

export const runtime = 'edge'

async function gate(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return p && ['owner', 'manager'].includes(p.role) ? user : null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await gate(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: p } = await admin.from('partners').select('id, code, status, tax_type, supplier_rate_card, is_frontier, profiles(name, email)').eq('id', id).maybeSingle()
  if (!p) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [{ data: brands }, { data: lineage }, { data: history }, { data: charges }] = await Promise.all([
    admin.from('services').select('id, name, active').eq('supplier_partner_id', id),
    admin.from('partners').select('id, code, status, frontier_linked_at, company_name, profiles(name)').eq('frontier_id', id),
    admin.from('supplier_card_events').select('event, from_card, to_card, created_at, note').eq('supplier_partner_id', id).order('created_at', { ascending: false }).limit(20),
    admin.from('supplier_charges').select('period, amount, status').eq('supplier_partner_id', id),
  ])
  const ym = new Date().toISOString().slice(0, 7)
  const chs = (charges ?? []) as { period: string; amount: number; status: string }[]
  return NextResponse.json({
    supplier: { id: p.id, code: p.code, name: (p as any).profiles?.name ?? p.code, email: (p as any).profiles?.email ?? null, status: p.status, tax_type: p.tax_type, is_frontier: p.is_frontier, rate_card: p.supplier_rate_card ?? STD_RATE_CARD },
    brands: brands ?? [], lineage: lineage ?? [], history: history ?? [],
    charges_month: chs.filter(c => c.period === ym).reduce((s, c) => s + Number(c.amount), 0),
    charges_total: chs.reduce((s, c) => s + Number(c.amount), 0),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await gate(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const admin = await createServiceRoleClient()
  const { data: p } = await admin.from('partners').select('id, status, supplier_rate_card').eq('id', id).maybeSingle()
  if (!p || !p.supplier_rate_card) return NextResponse.json({ error: 'サプライヤーが見つかりません' }, { status: 404 })

  // レートカード付け替え（標準移行オプションの実務）
  if (typeof b.rate_card_id === 'string' && b.rate_card_id) {
    const { data: card } = await admin.from('rate_cards').select('id').eq('id', b.rate_card_id).maybeSingle()
    if (!card) return NextResponse.json({ error: 'レートカードが見つかりません' }, { status: 400 })
    if (card.id === p.supplier_rate_card) return NextResponse.json({ error: '同じカードが既に適用中です' }, { status: 409 })
    const { error } = await admin.from('partners').update({ supplier_rate_card: card.id }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await admin.from('supplier_card_events').insert({ supplier_partner_id: id, event: 'card_changed', from_card: p.supplier_rate_card, to_card: card.id, changed_by: user.id, note: b.note ?? null }).then(() => {}, () => {})
    return NextResponse.json({ ok: true, applied: card.id })
  }

  // 契約停止/再開（P0-b: suspendedでoverride以後停止・APPログインも停止）
  if (b.action === 'suspend' || b.action === 'resume') {
    const to = b.action === 'suspend' ? 'suspended' : 'active'
    const { error } = await admin.from('partners').update({ status: to }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await admin.from('supplier_card_events').insert({ supplier_partner_id: id, event: b.action === 'suspend' ? 'suspended' : 'resumed', changed_by: user.id }).then(() => {}, () => {})
    return NextResponse.json({ ok: true, status: to })
  }
  return NextResponse.json({ error: 'rate_card_id か action(suspend|resume) を指定してください' }, { status: 400 })
}
