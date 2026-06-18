/**
 * 業務委託先（deliveries）マスタ — コンソール owner/manager。
 * GET  /api/console/deliveries  — 一覧
 * POST /api/console/deliveries  — 追加
 * テーブル未作成(DDL前)は ready:false / needsMigration（halt しない）。
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
  const { data, error } = await admin.from('deliveries').select('*').order('name')
  if (error) return NextResponse.json({ deliveries: [], ready: false })
  return NextResponse.json({ deliveries: data ?? [], ready: true })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireConsole(supabase, true))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  if (!b.name?.trim()) return NextResponse.json({ error: '名称は必須です' }, { status: 400 })
  const row = {
    name: String(b.name).trim().slice(0, 120),
    kind: b.kind ? String(b.kind).trim().slice(0, 60) : null,
    contact_email: b.contact_email ? String(b.contact_email).trim() : null,
    note: b.note ? String(b.note).trim().slice(0, 500) : null,
    active: b.active !== false,
  }
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('deliveries').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  return NextResponse.json({ delivery: data })
}
