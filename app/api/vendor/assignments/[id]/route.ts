/**
 * PATCH /api/vendor/assignments/[id] — 委託提示へのベンダー応答＋納品宣言。
 * body: { action: 'accept' | 'decline' | 'deliver' }
 * 純化バッチ: 契約とお金の公式記録に徹する。ライフサイクル proposed→accepted→delivered。
 *   deliver＝ベンダーが「納品済み」を宣言＝経費申請と粗利確定のゲート（正典業務フロー）。了承済(accepted)のみ deliver 可。
 * money非接触: base_fee/報酬には触れない（委託費のP&L算入は accepted/delivered/assigned 判定・GET集計側）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor, assertOwnAssignment } from '@/lib/vendor-auth'
import { notifySlackEvent } from '@/lib/slack'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  if (!(await assertOwnAssignment(vendor.deliveryId, id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const action = body.action as string
  if (!['accept', 'decline', 'deliver'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  const admin = await createServiceRoleClient()
  const { data: cur } = await admin.from('delivery_assignments').select('id, status, base_fee, deal_id').eq('id', id).single()
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 状態機械: proposed→accept/decline ／ accepted→deliver
  const from = action === 'deliver' ? 'accepted' : 'proposed'
  if (cur.status !== from) {
    return NextResponse.json({ error: action === 'deliver' ? '納品済みにできるのは了承済の委託のみです' : 'この提示にはすでに応答済みです' }, { status: 409 })
  }
  const next = action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'delivered'
  const { data: upd, error } = await admin.from('delivery_assignments')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', from).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!upd?.length) return NextResponse.json({ error: '状態が変化していません' }, { status: 409 })

  const verb = action === 'accept' ? '承諾' : action === 'decline' ? '辞退' : '納品済み'
  await notifySlackEvent('status_change', `📦 ${vendor.deliveryName} が委託を${verb}（¥${(cur.base_fee ?? 0).toLocaleString()}）`)
  return NextResponse.json({ ok: true, status: next })
}
