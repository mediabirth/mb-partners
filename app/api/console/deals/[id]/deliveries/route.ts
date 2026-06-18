/**
 * 案件のデリバリー割当（明細単位）— コンソール owner/manager。
 * POST /api/console/deals/[id]/deliveries  — 明細の割当を set/clear（set-semantics）。
 *   body: { deal_item_id, delivery_id(nullable=MB自身/委託費0), base_fee }
 * confirmed/paid はロック（L2準拠）。委託費はP&L読取専用＝reward/payout には触れない。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return user
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireWrite(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()

  const { data: deal } = await admin.from('deals').select('status').eq('id', id).single()
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
  if (!['received', 'in_progress'].includes(deal.status)) {
    return NextResponse.json({ error: '成約後の案件はデリバリー割当を編集できません' }, { status: 409 })
  }

  const b = await req.json()
  const dealItemId = b.deal_item_id || null
  const deliveryId = b.delivery_id || null
  const baseFee = Math.max(0, Math.round(Number(b.base_fee) || 0))

  // set-semantics：当該明細の既存割当を消してから（vendor選択時のみ）入れ直す。MB自身(委託費0)=delivery_id null=割当なし。
  let del = admin.from('delivery_assignments').delete().eq('deal_id', id)
  del = dealItemId ? del.eq('deal_item_id', dealItemId) : del.is('deal_item_id', null)
  const { error: delErr } = await del
  if (delErr) return NextResponse.json({ error: delErr.message, needsMigration: true }, { status: 200 })

  if (deliveryId) {
    const { error: insErr } = await admin.from('delivery_assignments').insert({
      deal_id: id, deal_item_id: dealItemId, delivery_id: deliveryId, base_fee: baseFee, assigned_by: user.id,
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
