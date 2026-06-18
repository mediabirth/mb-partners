/**
 * PATCH /api/console/deals/[id]/brief — 案件のデリバリー向けプロジェクト概要/スコープ（delivery_brief）。
 * owner/manager のみ。お金（reward/payout 等）には一切触れない＝実行メタデータのみ。
 * delivery_brief 列が未追加(DDL前)でも壊さない（needsMigration を返す）。
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
  const brief = typeof b.delivery_brief === 'string' ? b.delivery_brief.slice(0, 4000) : null
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('deals').update({ delivery_brief: brief }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  return NextResponse.json({ ok: true })
}
