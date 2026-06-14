import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { createNotification } from '@/lib/notifications'

export const runtime = 'edge'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: broadcast, error } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Count reads
  const { count: readCount } = await supabase
    .from('broadcast_reads')
    .select('*', { count: 'exact', head: true })
    .eq('broadcast_id', id)

  // Count total partners for this segment
  let partnerQuery = supabase.from('partners').select('*', { count: 'exact', head: true }).eq('status', 'active')
  if (broadcast.segment === 'individual') partnerQuery = partnerQuery.eq('tax_type', 'individual')
  else if (broadcast.segment === 'corporate') partnerQuery = partnerQuery.eq('tax_type', 'corporate')
  const { count: totalPartners } = await partnerQuery

  return NextResponse.json({
    broadcast: {
      ...broadcast,
      read_count: readCount ?? 0,
      total_partners: totalPartners ?? 0,
    },
  })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  if (body.action !== 'send') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  // Fetch broadcast
  const { data: broadcast, error: fetchErr } = await supabase
    .from('broadcasts')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchErr || !broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (broadcast.sent_at) return NextResponse.json({ error: 'Already sent' }, { status: 400 })

  const serviceSupabase = await createServiceRoleClient()

  // Update sent_at
  const sentAt = new Date().toISOString()
  const { error: updateErr } = await serviceSupabase
    .from('broadcasts')
    .update({ sent_at: sentAt })
    .eq('id', id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Fetch target partners
  let partnerQuery = serviceSupabase
    .from('partners')
    .select('id')
    .eq('status', 'active')

  if (broadcast.segment === 'individual') {
    partnerQuery = partnerQuery.eq('tax_type', 'individual')
  } else if (broadcast.segment === 'corporate') {
    partnerQuery = partnerQuery.eq('tax_type', 'corporate')
  }

  const { data: partners } = await partnerQuery

  // Send notifications to all target partners
  const kindLabel = broadcast.kind === 'news' ? 'お知らせ' : 'お役立ち'
  for (const partner of partners ?? []) {
    await createNotification(
      serviceSupabase,
      partner.id,
      `【${kindLabel}】${broadcast.title}`,
      broadcast.body ?? null,
      { type: 'broadcast', broadcast_id: id },
    )
  }

  // TODO: 3日後の自動再通知は今回スコープ外

  return NextResponse.json({ ok: true, sent_to: (partners ?? []).length })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Only allow deleting unsent broadcasts
  const { data: broadcast } = await supabase
    .from('broadcasts')
    .select('id, sent_at')
    .eq('id', id)
    .single()

  if (!broadcast) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (broadcast.sent_at) return NextResponse.json({ error: 'Cannot delete a sent broadcast' }, { status: 400 })

  const serviceSupabase = await createServiceRoleClient()
  const { error } = await serviceSupabase.from('broadcasts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
