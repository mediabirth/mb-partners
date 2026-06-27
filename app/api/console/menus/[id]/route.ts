/**
 * 新「メニュー（1報酬）」個別操作（owner/manager）。
 * PATCH  /api/console/menus/[id]  — 更新（name/reward_type/reward_value/reward_base/reward_trigger/sort/active）
 * DELETE /api/console/menus/[id]  — 削除（deals.menu_ref が参照中なら FK RESTRICT で失敗＝安全）
 * ★money計算・deals には関与しない。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return !!profile && ['owner', 'manager', 'admin'].includes(profile.role)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  const patch: Record<string, unknown> = {}
  if (typeof b.name === 'string') patch.name = b.name.trim().slice(0, 120)
  if (b.reward_type === 'fixed' || b.reward_type === 'rate') patch.reward_type = b.reward_type
  if (b.reward_value != null) patch.reward_value = Number(b.reward_value) || 0
  if ('reward_base' in b) patch.reward_base = b.reward_base || null
  if ('reward_trigger' in b) patch.reward_trigger = b.reward_trigger ? String(b.reward_trigger).trim() : null
  if (b.sort != null) patch.sort = Number(b.sort) || 0
  if (typeof b.active === 'boolean') patch.active = b.active
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('menus').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ menu: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('menus').delete().eq('id', id)
  // deals.menu_ref が参照中なら FK RESTRICT で失敗 → 案件参照中のメニューは削除不可（安全）。
  if (error) return NextResponse.json({ error: '案件が参照中のメニューは削除できません（' + error.message + '）' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
