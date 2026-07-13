/**
 * 案件のデリバリー割当 — コンソール owner/manager。
 * ライフサイクル対応（案件ライフサイクル・プログラム）:
 *   割当は成約後（confirmed）に行うのが正規フロー（勝彦定義: 成約→受注額確定→アサイン判断→委託費提示→ベンダー了承）。
 *   よって received/in_progress/confirmed で編集可・paid/lost はロック。
 *   新規割当は status='proposed'（提示中）で作成し、ベンダーの了承（/api/vendor/assignments/[id]）で accepted に。
 *   委託費の変更は再提示（status→proposed）。委託費はP&L読取専用＝reward/payout/frozen には触れない。
 *
 * POST /api/console/deals/[id]/deliveries
 *   op方式（新）: { op:'add', delivery_id, base_fee, deal_item_id? } ／ { op:'remove', assignment_id } ／ { op:'fee', assignment_id, base_fee }
 *               ／ { op:'deliver', assignment_id } — ベンダー純化P1: 納品済みの宣言（vendor面から移管・vendor-redesign.md §1 V2）。
 *                 状態機械は不変（accepted→delivered・書き手のみ運営へ）。宣言者・日時は deal_events に常時記録（争議証跡）。
 *   レガシー（op無し・set-semantics）: { deal_item_id, delivery_id(null=MB自身), base_fee } — 直営業起票モーダル等の既存呼び出し互換。
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
  const editable = ['received', 'in_progress', 'confirmed'].includes(deal.status)
  if (!editable) {
    return NextResponse.json({ error: 'この案件はデリバリー割当を編集できません' }, { status: 409 })
  }

  const b = await req.json()
  const baseFee = Math.max(0, Math.round(Number(b.base_fee) || 0))

  if (b.op === 'add') {
    const deliveryId = b.delivery_id || null
    if (!deliveryId) return NextResponse.json({ error: 'delivery_id required' }, { status: 400 })
    const { data: ins, error: insErr } = await admin.from('delivery_assignments').insert({
      deal_id: id, deal_item_id: b.deal_item_id || null, delivery_id: deliveryId,
      base_fee: baseFee, assigned_by: user.id, status: 'proposed',
    }).select('id').single()
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
    return NextResponse.json({ ok: true, assignment: ins })
  }

  if (b.op === 'remove') {
    if (!b.assignment_id) return NextResponse.json({ error: 'assignment_id required' }, { status: 400 })
    const { data: del, error: delErr } = await admin.from('delivery_assignments')
      .delete().eq('id', b.assignment_id).eq('deal_id', id).select('id')
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    if (!del?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  if (b.op === 'deliver') {
    if (!b.assignment_id) return NextResponse.json({ error: 'assignment_id required' }, { status: 400 })
    const { data: cur } = await admin.from('delivery_assignments')
      .select('id, status, base_fee, deliveries(name)').eq('id', b.assignment_id).eq('deal_id', id).maybeSingle()
    if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!['accepted', 'assigned'].includes(cur.status ?? '')) {
      return NextResponse.json({ error: '納品済みにできるのは了承済の委託のみです' }, { status: 409 })
    }
    const { data: upd, error: updErr } = await admin.from('delivery_assignments')
      .update({ status: 'delivered', updated_at: new Date().toISOString() })
      .eq('id', b.assignment_id).eq('status', cur.status).select('id')
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    if (!upd?.length) return NextResponse.json({ error: '状態が変化していません' }, { status: 409 })
    // 宣言者・日時の常時記録（deal_events＝案件タイムライン・パートナー非公開）
    const { data: prof } = await admin.from('profiles').select('name').eq('id', user.id).maybeSingle()
    const dlvName = (cur.deliveries as { name?: string } | null)?.name ?? '委託先'
    try {
      await admin.from('deal_events').insert({
        deal_id: id, visible_to_partner: false, created_by: user.id,
        body: `納品済みにしました: ${dlvName} ・ 委託費 ¥${(cur.base_fee ?? 0).toLocaleString()}（運営 ${prof?.name ?? ''} が確認）`,
      })
    } catch { /* best-effort: 記録失敗は状態遷移を妨げない */ }
    try { const { notifySlackEvent } = await import('@/lib/slack'); await notifySlackEvent('status_change', `📦 ${dlvName} の委託を納品済みに（運営 ${prof?.name ?? ''}・¥${(cur.base_fee ?? 0).toLocaleString()}）`) } catch { /* best-effort */ }
    return NextResponse.json({ ok: true, status: 'delivered' })
  }

  if (b.op === 'fee') {
    if (!b.assignment_id) return NextResponse.json({ error: 'assignment_id required' }, { status: 400 })
    // 委託費の変更＝再提示（了承済でも金額が変われば再度ベンダーの了承を要する）
    const { data: upd, error: updErr } = await admin.from('delivery_assignments')
      .update({ base_fee: baseFee, status: 'proposed', updated_at: new Date().toISOString() })
      .eq('id', b.assignment_id).eq('deal_id', id).select('id')
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
    if (!upd?.length) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  // ── レガシー set-semantics（既存呼び出し互換・明細単位で消して入れ直す）──
  const dealItemId = b.deal_item_id || null
  const deliveryId = b.delivery_id || null
  let del = admin.from('delivery_assignments').delete().eq('deal_id', id)
  del = dealItemId ? del.eq('deal_item_id', dealItemId) : del.is('deal_item_id', null)
  const { error: delErr } = await del
  if (delErr) return NextResponse.json({ error: delErr.message, needsMigration: true }, { status: 200 })

  if (deliveryId) {
    const { error: insErr } = await admin.from('delivery_assignments').insert({
      deal_id: id, deal_item_id: dealItemId, delivery_id: deliveryId, base_fee: baseFee, assigned_by: user.id, status: 'proposed',
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
