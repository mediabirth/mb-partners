import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { status } = body

  const valid = ['received', 'in_progress', 'confirmed', 'paid']
  if (!valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  const { data: deal, error } = await supabase
    .from('deals')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, customer_name, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log
  await supabase.from('deal_events').insert({
    deal_id: id,
    body: `ステータスを「${{ received: '受付', in_progress: '対応中', confirmed: '成約確定', paid: '支払済' }[status as string]}」に変更しました`,
    created_by: user.id,
    visible_to_partner: ['confirmed', 'paid'].includes(status),
  })

  return NextResponse.json({ deal })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: deal } = await supabase.from('deals').select('status').eq('id', id).single()
  if (deal?.status === 'paid') return NextResponse.json({ error: 'Cannot cancel a paid deal' }, { status: 400 })

  const { error } = await supabase.from('deals').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
