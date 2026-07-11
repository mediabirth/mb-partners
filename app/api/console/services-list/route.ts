/** ブランドの軽量一覧（Feature I: 供給元結線UI用・id/nameのみ）。 */
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
  const { data } = await admin.from('services').select('id, name').order('sort')
  return NextResponse.json({ services: data ?? [] })
}
