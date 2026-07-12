/**
 * 報酬（menu_rewards）個別操作（owner/manager）。
 * PATCH  /api/console/menu-rewards/[id]  — 更新
 * DELETE /api/console/menu-rewards/[id]  — 削除（reward_id 紐付けタスクは CASCADE・deals.reward_ref 参照中は RESTRICT）
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { parseAmount } from '@/lib/num'

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
  if (b.reward_type === 'fixed' || b.reward_type === 'rate' || b.reward_type === 'continuous') patch.reward_type = b.reward_type
  if (b.reward_value != null) patch.reward_value = parseAmount(b.reward_value)
  if ('reward_base' in b) patch.reward_base = b.reward_base || null
  if ('reward_trigger' in b) patch.reward_trigger = b.reward_trigger ? String(b.reward_trigger).trim() : null
  if ('default_months' in b) patch.default_months = b.reward_type === 'continuous' ? (parseAmount(b.default_months) || null) : null
  if (b.sort != null) patch.sort = Number(b.sort) || 0
  if (typeof b.active === 'boolean') patch.active = b.active
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const admin = await createServiceRoleClient()
  // P0-a: 逆ザヤ防止（サプライヤーメニュー＝rate/continuousは50%硬上限・fixedは警告）。仕様正典 v2 §7-7。
  let warning: string | null = null
  try {
    const { data: curRow } = await admin.from('menu_rewards').select('menu_id, reward_type, reward_value, reward_base').eq('id', id).single()
    if (curRow) {
      const effType = (patch.reward_type as string) ?? curRow.reward_type
      const effValue = (patch.reward_value as number) ?? Number(curRow.reward_value)
      const effBase = ('reward_base' in patch ? patch.reward_base : curRow.reward_base) as string | null
      const { validateSupplierReward } = await import('@/lib/supplier-fee')
      const guard = await validateSupplierReward(admin, curRow.menu_id, effType, effValue, effBase)
      if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 400 })
      warning = guard.warning ?? null
    }
  } catch { /* fail-open */ }
  const { data, error } = await admin.from('menu_rewards').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ reward: data, warning })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('menu_rewards').delete().eq('id', id)
  if (error) return NextResponse.json({ error: '案件が参照中の報酬は削除できません（' + error.message + '）' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
