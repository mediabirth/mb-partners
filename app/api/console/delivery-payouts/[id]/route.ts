/**
 * デリバリー支払明細 個別操作（owner/manager）。
 * PATCH  /api/console/delivery-payouts/[id]  body: { paid: true|false }  — 支払済/未払いの切替（paid_at/paid_by 記録）。
 * DELETE /api/console/delivery-payouts/[id]  — 未払い(unpaid)の凍結取消（誤凍結のやり直し用）。支払済は不可。
 *
 * パートナー支払には一切触れない＝delivery_payout_items のみ。
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireWrite(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json()
  const paid = b.paid === true
  const patch: Record<string, unknown> = {
    status: paid ? 'paid' : 'unpaid',
    paid_at: paid ? new Date().toISOString() : null,
    paid_by: paid ? user.id : null,
    updated_at: new Date().toISOString(),
  }
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('delivery_payout_items').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: row } = await admin.from('delivery_payout_items').select('status').eq('id', id).single()
  if (row?.status === 'paid') return NextResponse.json({ error: '支払済みの明細は取り消せません' }, { status: 409 })
  const { error } = await admin.from('delivery_payout_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
