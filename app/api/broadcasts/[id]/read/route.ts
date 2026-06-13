import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: broadcastId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get partner record for this user
  const { data: partner } = await supabase
    .from('partners')
    .select('id')
    .eq('profile_id', user.id)
    .single()

  if (!partner) return NextResponse.json({ error: 'Partner not found' }, { status: 404 })

  const serviceSupabase = await createServiceRoleClient()

  // Upsert read record (ignore duplicate)
  const { error } = await serviceSupabase
    .from('broadcast_reads')
    .upsert(
      { broadcast_id: broadcastId, partner_id: partner.id },
      { onConflict: 'broadcast_id,partner_id', ignoreDuplicates: true }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
