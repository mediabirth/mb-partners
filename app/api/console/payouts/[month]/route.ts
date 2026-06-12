import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 })

  const body = await req.json()
  if (body.action !== 'mark_paid') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  // month param is 'YYYY-MM', convert to date for DB query
  const monthDate = `${month}-01`

  // Verify batch exists and is closed (not open, not already paid)
  const { data: batch } = await supabase
    .from('payout_batches')
    .select('id, status')
    .eq('month', monthDate)
    .single()

  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (batch.status === 'open') return NextResponse.json({ error: 'Batch is not yet closed' }, { status: 400 })
  if (batch.status === 'paid') return NextResponse.json({ error: 'Batch is already paid' }, { status: 400 })

  const serviceSupabase = await createServiceRoleClient()

  // 1. Mark batch as paid
  await serviceSupabase.from('payout_batches').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', batch.id)

  // 2. Move all confirmed deals that belong to this batch's payout_items to 'paid'
  const { data: items } = await serviceSupabase
    .from('payout_items')
    .select('partner_id, statement')
    .eq('batch_id', batch.id)

  const partnerIds = (items ?? []).map(i => i.partner_id)

  // Extract deal IDs from statement JSONB (precise — no date math needed)
  const dealIds: string[] = (items ?? []).flatMap(i => {
    const stmt = i.statement as { deals?: { deal_id: string }[] } | null
    return stmt?.deals?.map(d => d.deal_id) ?? []
  })

  if (dealIds.length > 0) {
    // Mark only the exact deals in this batch as paid
    await serviceSupabase
      .from('deals')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .in('id', dealIds)
  }

  if (partnerIds.length > 0) {
    // Notify each partner
    const notifications = partnerIds.map(pid => ({
      partner_id: pid,
      title: `${month}月の報酬が振込されました`,
      body: '報酬タブで明細をご確認ください',
      ref: { type: 'payout_paid', batch_id: batch.id },
    }))
    await serviceSupabase.from('notifications').insert(notifications)
  }

  // 3. Insert deal_events for audit
  try {
    await serviceSupabase.from('deal_events').insert({
      deal_id: null,
      body: `${month} バッチを支払済にしました (batch_id: ${batch.id})`,
      created_by: user.id,
      visible_to_partner: false,
    })
  } catch { /* deal_events may require deal_id — ignore */ }

  return NextResponse.json({ ok: true, partner_count: partnerIds.length })
}
