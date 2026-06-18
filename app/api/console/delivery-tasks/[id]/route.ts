/**
 * PATCH/DELETE /api/console/delivery-tasks/[id] — 公式タスク/マイルストーンの編集・削除（MBのみ）。
 * owner/manager のみ。お金ロジック非接触。
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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.title === 'string') patch.title = b.title.trim().slice(0, 200)
  if (b.type === 'task' || b.type === 'milestone') patch.type = b.type
  if (typeof b.needs_deliverable === 'boolean') patch.needs_deliverable = b.needs_deliverable
  if ('due_date' in b) patch.due_date = b.due_date ? String(b.due_date).slice(0, 10) : null
  if (Number.isFinite(Number(b.sort))) patch.sort = Number(b.sort)
  // status は本来 V-2 で vendor が更新するが、MB が訂正できるよう許容（done_by/at を整える）。
  if (b.status === 'pending' || b.status === 'done') {
    patch.status = b.status
    patch.done_at = b.status === 'done' ? new Date().toISOString() : null
    patch.done_by = b.status === 'done' ? user.id : null
  }
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('delivery_tasks').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('delivery_tasks').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
