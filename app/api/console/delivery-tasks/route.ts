/**
 * POST /api/console/delivery-tasks — 公式タスク/マイルストーンを作成（MBのみ・delivery_assignment 単位）。
 * owner/manager のみ。vendor は構造を作れない（このルートは console 認証）。お金ロジック非接触。
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

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = await requireWrite(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  const assignmentId = String(b.delivery_assignment_id ?? '').trim()
  const title = String(b.title ?? '').trim()
  if (!assignmentId || !title) return NextResponse.json({ error: 'delivery_assignment_id と title は必須です' }, { status: 400 })
  const row = {
    delivery_assignment_id: assignmentId,
    title: title.slice(0, 200),
    type: b.type === 'milestone' ? 'milestone' : 'task',
    needs_deliverable: b.needs_deliverable === true,
    due_date: b.due_date ? String(b.due_date).slice(0, 10) : null,
    sort: Number.isFinite(Number(b.sort)) ? Number(b.sort) : 0,
    created_by: user.id,
  }
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('delivery_tasks').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  return NextResponse.json({ task: data })
}
