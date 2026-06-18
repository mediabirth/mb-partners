/**
 * 案件P&Lメタ（MB担当・その他原価）の更新。コンソール owner/manager のみ。
 * P&L表示専用の値であり、reward/payout/frozen/override には一切触れない。
 * director_id / other_cost 列が未追加(DDL前)でも壊さない（needsMigration を返す）。
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
  if ('director_id' in b) patch.director_id = b.director_id || null
  if ('other_cost' in b) patch.other_cost = b.other_cost === '' || b.other_cost == null ? 0 : Math.max(0, Math.round(Number(b.other_cost)))
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const { error } = await admin.from('deals').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  return NextResponse.json({ ok: true })
}
