import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, color')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: deals } = await supabase
    .from('deals')
    .select(`
      id, customer_name, channel, source, status, amount,
      fixed_month, created_at, service_id,
      services(name, icon, color),
      partners(code, profiles(name, color))
    `)
    .order('created_at', { ascending: false })

  return NextResponse.json({ deals: deals ?? [], profile })
}
