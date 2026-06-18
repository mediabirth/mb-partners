/**
 * PATCH /api/vendor/tasks/[id] — vendor がタスクの完了チェック（status done/undone のみ）。
 * 本人の割当のタスクか検証（assertOwnTask）。構造（タイトル/種別/期日等）は変更不可＝実行シグナルのみ。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor, assertOwnTask } from '@/lib/vendor-auth'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await assertOwnTask(vendor.deliveryId, id))) return NextResponse.json({ error: 'このタスクを更新する権限がありません' }, { status: 403 })

  const b = await req.json()
  const done = b.status === 'done'
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('delivery_tasks').update({
    status: done ? 'done' : 'pending',
    done_at: done ? new Date().toISOString() : null,
    done_by: done ? vendor.userId : null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select('id, status, done_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ task: data })
}
