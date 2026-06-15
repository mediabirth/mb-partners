import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifySlack } from '@/lib/slack'

export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { customer_name, service_id, channel, source, status, amount, internal_memo } = body
  if (!customer_name || !service_id) return NextResponse.json({ error: 'customer_name and service_id required' }, { status: 400 })

  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      customer_name,
      service_id,
      channel: channel ?? 'direct',
      source: source ?? 'manual',
      status: status ?? 'received',
      amount: amount ?? 0,
      internal_memo: internal_memo ?? null,
      consent: true,
    })
    .select('id, customer_name, channel, source, status, amount, created_at, service_id, services(name, icon, color), partners(code, profiles(name, color))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await notifySlack(`🆕 新規案件（手動登録）: ${customer_name}`)

  return NextResponse.json({ deal })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, color')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: deals } = await supabase
    .from('deals')
    .select(`
      id, customer_name, channel, source, status, amount, base_amount,
      fixed_month, created_at, service_id, reward_snapshot,
      services(name, icon, color, coop_rate, coop_base),
      partners(code, profiles(name, color))
    `)
    .order('created_at', { ascending: false })

  return NextResponse.json({ deals: deals ?? [], profile })
}
