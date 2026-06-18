/**
 * 業務委託先 個別操作（owner/manager）。
 * PATCH  /api/console/deliveries/[id]  — 編集（name/kind/contact_email/note/active）
 * DELETE /api/console/deliveries/[id]  — 削除
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
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.name === 'string') patch.name = b.name.trim().slice(0, 120)
  if ('kind' in b) patch.kind = b.kind ? String(b.kind).trim().slice(0, 60) : null
  if ('contact_email' in b) patch.contact_email = b.contact_email ? String(b.contact_email).trim() : null
  if ('note' in b) patch.note = b.note ? String(b.note).trim().slice(0, 500) : null
  if (typeof b.active === 'boolean') patch.active = b.active
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('deliveries').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ delivery: data })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('deliveries').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
