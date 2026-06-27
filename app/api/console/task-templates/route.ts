/**
 * 協力タスクテンプレ マスタ（owner/manager）。
 * GET  /api/console/task-templates  — テンプレ一覧＋サービス一覧
 * POST /api/console/task-templates  — テンプレ追加
 * テーブル未作成(DDL前)は ready:false / needsMigration を返す（halt しない）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

async function requireConsole(supabase: Awaited<ReturnType<typeof createClient>>, write = false) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return null
  if (write && !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return user
}

export async function GET() {
  const supabase = await createClient()
  if (!(await requireConsole(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: templates, error } = await admin
    .from('cooperation_task_templates').select('*').order('service_id').order('sort')
  const { data: services } = await admin.from('services').select('id, name')
  if (error) return NextResponse.json({ templates: [], services: services ?? [], ready: false })
  return NextResponse.json({ templates: templates ?? [], services: services ?? [], ready: true })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireConsole(supabase, true))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  if (!b.service_id || !b.label?.trim()) return NextResponse.json({ error: 'service_id と label は必須です' }, { status: 400 })
  const row = {
    service_id: b.service_id,
    menu_id: b.menu_id || null,
    reward_id: b.reward_id || null,   // 報酬単位の協力タスク紐付け（新モデルの正）
    label: String(b.label).trim().slice(0, 120),
    kind: b.kind === 'auto' ? 'auto' : 'manual',
    required: b.required !== false,
    trigger_key: b.kind === 'auto' && b.trigger_key ? String(b.trigger_key).trim() : null,
    sort: Number(b.sort) || 0,
    active: b.active !== false,
  }
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('cooperation_task_templates').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  return NextResponse.json({ template: data })
}
