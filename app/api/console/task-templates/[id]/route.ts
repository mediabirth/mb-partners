/**
 * 協力タスクテンプレ 個別操作（owner/manager）。
 * PATCH  /api/console/task-templates/[id]  — 更新（label/kind/required/trigger_key/sort/active）
 * DELETE /api/console/task-templates/[id]  — 削除
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
  if (typeof b.label === 'string') patch.label = b.label.trim().slice(0, 120)
  if (b.kind === 'auto' || b.kind === 'manual') patch.kind = b.kind
  if (typeof b.required === 'boolean') patch.required = b.required
  if ('trigger_key' in b) patch.trigger_key = b.trigger_key ? String(b.trigger_key).trim() : null
  if (b.sort != null) patch.sort = Number(b.sort) || 0
  if (typeof b.active === 'boolean') patch.active = b.active
  // v3.1：タスク説明（ⓘポップオーバー用・登録ページで表示）。
  if ('description' in b) patch.description = b.description ? String(b.description).trim().slice(0, 500) : null
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('cooperation_task_templates').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ template: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('cooperation_task_templates').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
