import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return null
  return user
}

const ALLOWED = [
  'name', 'category', 'ref_type', 'ref_value', 'ref_base', 'ref_trigger', 'ref_months', 'example_ref',
  'ft_enabled', 'ft_rate', 'ft_basis', 'ft_trigger', 'ft_condition', 'example_ft',
  'coverage_steps', 'qualification', 'sort',
]

export const runtime = 'edge'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, mid } = await params
  const body = await req.json()

  const patch: Record<string, unknown> = {}
  for (const key of ALLOWED) {
    if (key in body) patch[key] = body[key]
  }

  const { data: menu, error } = await supabase
    .from('service_menus')
    .update(patch)
    .eq('id', mid)
    .eq('service_id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ menu })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; mid: string }> },
) {
  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, mid } = await params

  const { error } = await supabase
    .from('service_menus')
    .delete()
    .eq('id', mid)
    .eq('service_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
