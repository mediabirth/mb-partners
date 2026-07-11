/**
 * サプライヤー管理（Feature I）。GET=一覧（結線集計つき）／POST=昇格（フロンティア→サプライヤー）。
 * サプライヤーの定義＝ partners.supplier_rate_card 非null ∪ services.supplier_partner_id 参照あり。
 * ★money非接触（rate card参照の設定のみ。凍結済みfee_snapshot/supplier_chargesには波及しない）。
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

export async function GET() {
  const supabase = await createClient()
  if (!(await gate(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const [{ data: byCard }, { data: byService }] = await Promise.all([
    admin.from('partners').select('id').not('supplier_rate_card', 'is', null),
    admin.from('services').select('supplier_partner_id').not('supplier_partner_id', 'is', null),
  ])
  const ids = [...new Set([...(byCard ?? []).map((p: { id: string }) => p.id), ...(byService ?? []).map((s: { supplier_partner_id: string }) => s.supplier_partner_id)])]
  if (!ids.length) return NextResponse.json({ suppliers: [] })
  const [{ data: ps }, { data: svs }, { data: lineage }] = await Promise.all([
    admin.from('partners').select('id, code, status, tax_type, supplier_rate_card, profiles(name)').in('id', ids),
    admin.from('services').select('id, name, supplier_partner_id').in('supplier_partner_id', ids),
    admin.from('partners').select('id, frontier_id').in('frontier_id', ids),
  ])
  const suppliers = (ps ?? []).map((p: any) => ({
    id: p.id, code: p.code, name: p.profiles?.name ?? p.code,
    status: p.status, tax_type: p.tax_type,
    rate_card: p.supplier_rate_card ?? STD_RATE_CARD,
    brands: (svs ?? []).filter((s: any) => s.supplier_partner_id === p.id).map((s: any) => ({ id: s.id, name: s.name })),
    lineage_count: (lineage ?? []).filter((l: any) => l.frontier_id === p.id).length,
  }))
  return NextResponse.json({ suppliers })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = await gate(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const partnerId = String(b.partner_id ?? '')
  const cardId = String(b.rate_card_id ?? STD_RATE_CARD)
  if (!partnerId) return NextResponse.json({ error: 'partner_id は必須です' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { data: p } = await admin.from('partners').select('id, is_frontier, tax_type, supplier_rate_card').eq('id', partnerId).maybeSingle()
  if (!p) return NextResponse.json({ error: 'パートナーが見つかりません' }, { status: 404 })
  if (!p.is_frontier) return NextResponse.json({ error: 'サプライヤーはフロンティア（会社）パートナーから昇格します。先にフロンティアに設定してください。' }, { status: 400 })
  if (p.supplier_rate_card) return NextResponse.json({ error: '既にサプライヤーです' }, { status: 409 })
  const { data: card } = await admin.from('rate_cards').select('id').eq('id', cardId).maybeSingle()
  if (!card) return NextResponse.json({ error: 'レートカードが見つかりません' }, { status: 400 })
  const { error } = await admin.from('partners').update({ supplier_rate_card: cardId }).eq('id', partnerId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await admin.from('supplier_card_events').insert({ supplier_partner_id: partnerId, event: 'promoted', from_card: null, to_card: cardId, changed_by: user.id }).then(() => {}, () => {})
  return NextResponse.json({ ok: true, warning: p.tax_type !== 'corporate' ? 'このパートナーの税区分が法人（corporate）ではありません。override支払に源泉が誤適用されるため、法人へ変更してください。' : null }, { status: 201 })
}
