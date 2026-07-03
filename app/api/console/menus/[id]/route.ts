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
  if (b.sort != null) patch.sort = Number(b.sort) || 0
  if (typeof b.active === 'boolean') patch.active = b.active
  // 段階B：担当カレンダーアカウント（旧・残置）。段階3a：担当メンバー（null/'' = 既定owner へ）。
  if ('calendar_account_id' in b) patch.calendar_account_id = b.calendar_account_id ? String(b.calendar_account_id) : null
  if ('calendar_member_id' in b) patch.calendar_member_id = b.calendar_member_id ? String(b.calendar_member_id) : null
  // リファラルWave1：メニュー一言説明（''→null）
  if ('short_description' in b) patch.short_description = typeof b.short_description === 'string' && b.short_description.trim() ? b.short_description.trim().slice(0, 200) : null
  // menu_context v2：メニュー詳細説明（''→null・詳細シート「このメニューでは」）
  if ('description' in b) patch.description = typeof b.description === 'string' && b.description.trim() ? b.description.trim().slice(0, 1000) : null
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
