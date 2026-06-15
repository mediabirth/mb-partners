import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return null
  return user
}

export const runtime = 'edge'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const { data: menus, error } = await supabase
    .from('service_menus')
    .select('*')
    .eq('service_id', id)
    .order('sort')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ menus: menus ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await req.json()

  // Get next sort value
  const { data: existing } = await supabase
    .from('service_menus')
    .select('sort')
    .eq('service_id', id)
    .order('sort', { ascending: false })
    .limit(1)

  const nextSort = (existing?.[0]?.sort ?? -1) + 1

  const insert = {
    service_id:     id,
    name:           body.name ?? '新しいメニュー',
    category:       body.category ?? 'referral',
    ref_type:       body.ref_type ?? 'fixed',
    ref_value:      body.ref_value ?? 0,
    ref_base:       body.ref_base ?? null,
    ref_trigger:    body.ref_trigger ?? null,
    ref_months:     body.ref_months ?? 1,
    example_ref:    body.example_ref ?? null,
    ft_enabled:     body.ft_enabled ?? false,
    ft_rate:        body.ft_rate ?? null,
    ft_basis:       body.ft_basis ?? null,
    ft_trigger:     body.ft_trigger ?? null,
    ft_condition:   body.ft_condition ?? null,
    example_ft:     body.example_ft ?? null,
    coverage_steps: body.coverage_steps ?? null,
    qualification:  body.qualification ?? null,
    sort:           nextSort,
    // ⑧ per-menu engagement flags
    ref_enabled:    body.ref_enabled ?? true,
    coop_enabled:   body.coop_enabled ?? false,
    coop_type:      body.coop_type ?? null,
    coop_value:     body.coop_value ?? null,
    coop_base:      body.coop_base ?? null,
    coop_coverage:  body.coop_coverage ?? null,
    coop_condition: body.coop_condition ?? null,
  }

  const { data: menu, error } = await supabase
    .from('service_menus')
    .insert(insert)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ menu })
}
