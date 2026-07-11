/** 昇格候補＝is_frontierかつ未サプライヤーのパートナー（Feature I）。 */
import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
export const runtime = 'edge'
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data: p } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!p || !['owner', 'manager'].includes(p.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data } = await admin.from('partners').select('id, code, is_frontier, supplier_rate_card, profiles(name)').eq('is_frontier', true).is('supplier_rate_card', null)
  return NextResponse.json({ candidates: (data ?? []).map((x: any) => ({ id: x.id, code: x.code, name: x.profiles?.name ?? x.code })) })
}
