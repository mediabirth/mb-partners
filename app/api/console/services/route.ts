import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { name, subtitle, description, who, url, active, logo_path, icon, color,
          coop_enabled, coop_rate, coop_base, ft_trigger, ft_condition, coverage_steps } = body
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const { data: service, error } = await supabase
    .from('services')
    .insert({
      name,
      subtitle:       subtitle       || null,
      description:    description    || null,
      who:            who            || null,
      url:            url            || null,
      active:         active         ?? true,
      logo_path:      logo_path      || null,
      icon:           icon           || 'arrows',
      color:          color          || '#4733e6',
      sort:           99,
      coop_enabled:   coop_enabled   ?? false,
      coop_rate:      coop_rate      ?? null,
      coop_base:      coop_base      || null,
      ft_trigger:     ft_trigger     || null,
      ft_condition:   ft_condition   || null,
      coverage_steps: coverage_steps ?? null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ service })
}
