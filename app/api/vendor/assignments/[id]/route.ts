/**
 * PATCH /api/vendor/assignments/[id] — 委託提示へのベンダー応答（承諾/辞退）。
 * body: { action: 'accept' | 'decline' }
 * 勝彦フロー「委託費を提示→ベンダー了承→アサイン確定（売上と委託費が確定）」のベンダー側アクション。
 * 応答できるのは提示中（proposed）の自分の割当のみ（assertOwnAssignment）。
 * money非接触: base_fee/報酬には触れない。承諾＝statusのみ（委託費のP&L算入はGET集計側の accepted 判定）。
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
  if (action !== 'accept' && action !== 'decline') {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  const admin = await createServiceRoleClient()
  const { data: cur } = await admin.from('delivery_assignments').select('id, status, base_fee, deal_id').eq('id', id).single()
  if (!cur) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (cur.status !== 'proposed') {
    return NextResponse.json({ error: 'この提示にはすでに応答済みです' }, { status: 409 })
  }

  const next = action === 'accept' ? 'accepted' : 'declined'
  const { data: upd, error } = await admin.from('delivery_assignments')
    .update({ status: next, updated_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'proposed').select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!upd?.length) return NextResponse.json({ error: 'この提示にはすでに応答済みです' }, { status: 409 })

  await notifySlackEvent('status_change', `📦 ${vendor.deliveryName} が委託提示に${action === 'accept' ? '承諾' : '辞退'}（¥${(cur.base_fee ?? 0).toLocaleString()}）`)
  return NextResponse.json({ ok: true, status: next })
}
