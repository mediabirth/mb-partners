import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { augmentBatches } from '@/lib/frontier-payout'

export const runtime = 'edge'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: batches, error } = await supabase
    .from('payout_batches')
    .select(`
      id, month, status, closed_at, paid_at,
      payout_items(id, partner_id, gross, withholding, net, statement,
        partners(code, profiles(name, color)))
    `)
    .order('month', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // R2-E: フロンティアの override を合算（snapshot不変・導出）
  const admin = await createServiceRoleClient()
  const augmented = await augmentBatches(admin, batches ?? [])
  return NextResponse.json({ batches: augmented })
}

export async function POST() {
  // Manual admin trigger: close current month (for testing / emergency use)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 })

  const { createServiceRoleClient } = await import('@/lib/supabase/server')
  const serviceSupabase = await createServiceRoleClient()

  const now = new Date()
  const targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const { data, error } = await serviceSupabase.rpc('close_month_batch', { target_month: targetMonth })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, result: data })
}
