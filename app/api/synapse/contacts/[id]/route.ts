import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

// SYNAPSE Phase 0：私的台帳の1件更新/削除（partner本人の行のみ・隔離）。
// ★常に partner_id + id にスコープ＝他人の行には絶対に触れない。お金/deals/frontier 非接触。
export const runtime = 'edge'

const FIELDS = ['name', 'company', 'industry', 'role', 'relationship', 'needs', 'notes'] as const

async function resolvePartnerId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: partner } = await supabase.from('partners').select('id').eq('profile_id', user.id).single()
  return partner?.id ?? null
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const partnerId = await resolvePartnerId()
    if (!partnerId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    const b = await req.json().catch(() => ({}))
    const patch: Record<string, string | null> = { updated_at: new Date().toISOString() }
    for (const f of FIELDS) if (f in (b ?? {})) patch[f] = typeof b[f] === 'string' && b[f].trim() ? b[f].trim().slice(0, 2000) : null
    const admin = await createServiceRoleClient()
    const { data, error } = await admin
      .from('synapse_contacts')
      .update(patch)
      .eq('id', id)
      .eq('partner_id', partnerId)   // 本人の行のみ
      .select('id, name, company, industry, role, relationship, needs, notes, source, created_at, updated_at')
      .maybeSingle()
    if (error) return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ contact: data })
  } catch {
    return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const partnerId = await resolvePartnerId()
    if (!partnerId) return NextResponse.json({ error: 'ログインが必要です' }, { status: 401 })
    const admin = await createServiceRoleClient()
    const { error } = await admin
      .from('synapse_contacts')
      .delete()
      .eq('id', id)
      .eq('partner_id', partnerId)   // 本人の行のみ
    if (error) return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 })
  }
}
