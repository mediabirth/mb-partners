/**
 * PATCH /api/vendor/assignments/[id] — 委託提示へのベンダー応答（承諾/辞退＝合意証跡・本人操作必須）。
 * body: { action: 'accept' | 'decline' }
 * ベンダー純化P1: 納品宣言（deliver）はベンダー面から撤去し、発注元（コンソール/サプライヤー・コンソール）へ移管。
 *   状態機械 proposed→accepted→delivered は不変＝delivered の書き手だけが変わる（vendor-redesign.md §1 V2）。
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
  if (action === 'deliver') {
    // 移管済み: 納品の確認は発注元が行う（vendor-redesign.md §1 V2）。
    return NextResponse.json({ error: '納品の確認は発注元が行います' }, { status: 405 })
  }
  if (!['accept', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  const admin = await createServiceRoleClient()
  const { data: cur } = await admin.from('delivery_assignments').select('id, status, base_fee, deal_id').eq('id', id).single()
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 状態機械: proposed→accept/decline（deliver は発注元側 API が担う）
  const from = 'proposed'
  if (cur.status !== from) {
    return NextResponse.json({ error: 'この提示にはすでに応答済みです' }, { status: 409 })
  }
  const next = action === 'accept' ? 'accepted' : 'declined'
  const { data: upd, error } = await admin.from('delivery_assignments')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', from).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!upd?.length) return NextResponse.json({ error: '状態が変化していません' }, { status: 409 })

  const verb = action === 'accept' ? '承諾' : '辞退'
  await notifySlackEvent('status_change', `📦 ${vendor.deliveryName} が委託を${verb}（¥${(cur.base_fee ?? 0).toLocaleString()}）`)
  return NextResponse.json({ ok: true, status: next })
}
