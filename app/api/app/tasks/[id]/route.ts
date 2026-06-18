/**
 * PATCH /api/app/tasks/[id]
 * パートナーが自分の協力dealの manual タスクを完了/未完了に切替（任意メモ）。
 * auto タスクはシステム制御のため不可。node ランタイム（deal_tasks は service_role）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const admin = await createServiceRoleClient()

  const { data: task } = await admin.from('deal_tasks').select('id, deal_id, kind').eq('id', id).single()
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  // 所有確認：タスクの deal が本人のものか
  const { data: deal } = await admin.from('deals').select('partner_id').eq('id', task.deal_id).single()
  if (!deal || deal.partner_id !== partner.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (task.kind !== 'manual') return NextResponse.json({ error: 'auto タスクは変更できません' }, { status: 400 })

  const done = !!body.done
  const patch: Record<string, unknown> = {
    done,
    done_at: done ? new Date().toISOString() : null,
    done_by: done ? user.id : null,
  }
  if (typeof body.note === 'string') patch.note = body.note.trim().slice(0, 300) || null

  const { error } = await admin.from('deal_tasks').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, done })
}
