/**
 * PATCH /api/console/delivery-updates/[id] — 課題フラグの resolve（MBのみ）。
 * vendor の進捗メモ/フラグ投稿は V-2。V-1 はコンソールからの resolve 器のみ。お金ロジック非接触。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json()
  const resolved = b.status === 'resolved'
  const patch = {
    status: resolved ? 'resolved' : 'open',
    resolved_at: resolved ? new Date().toISOString() : null,
    resolved_by: resolved ? user.id : null,
  }
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('delivery_updates').update(patch).eq('id', id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ update: data })
}
