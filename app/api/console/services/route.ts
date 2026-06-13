import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, subtitle, icon, color, description, who, url, active } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data: service, error } = await supabase
    .from('services')
    .insert({ name, subtitle: subtitle || null, icon: icon || 'home', color: color || '#4733E6', description: description || null, who: who || null, url: url || null, active: active ?? true, sort: 99 })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ service })
}
