/**
 * 対応範囲（協力タスク）の管理側操作。
 * GET   /api/console/deals/[id]/tasks      … その deal の deal_tasks 一覧（管理側表示）。
 * PATCH /api/console/deals/[id]/tasks      … { taskId, done } で done を立て/外す（done_by=操作管理者）。
 *
 * ★操作主体の移管のみ：done の値を書くだけ。requiredTasksDone・成約確定ゲート・レート計算・reward・④b・帰属は不変。
 * gate＝既存 console deal 管理と同一（非partner スタッフ・anon401/partner403）。service_role で deal_tasks を更新。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
export const runtime = 'nodejs'

async function staffGate() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { user }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await staffGate(); if (g.error) return g.error
  const { id } = await params
  const admin = await createServiceRoleClient()
  const { data } = await admin.from('deal_tasks')
    .select('id, label, kind, required, done, done_at, done_by, note, sort')
    .eq('deal_id', id).order('sort', { ascending: true })
  return NextResponse.json({ tasks: data ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const g = await staffGate(); if (g.error) return g.error
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const taskId = typeof body.taskId === 'string' ? body.taskId : null
  if (!taskId) return NextResponse.json({ error: 'taskId required' }, { status: 400 })
  const done = !!body.done

  const admin = await createServiceRoleClient()
  // タスクが当該 deal に属することを確認（誤操作防止）。
  const { data: task } = await admin.from('deal_tasks').select('id, deal_id').eq('id', taskId).maybeSingle()
  if (!task || task.deal_id !== id) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const { error } = await admin.from('deal_tasks').update({
    done, done_at: done ? new Date().toISOString() : null, done_by: done ? g.user!.id : null,
  }).eq('id', taskId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, done })
}
