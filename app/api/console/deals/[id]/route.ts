import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { notifySlackEvent } from '@/lib/slack'

export const runtime = 'edge'

const STATUS_LABEL: Record<string, string> = { received: '受付', in_progress: '対応中', confirmed: '成約確定', paid: '支払済' }

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { status, base_amount } = body
  const hasStatus = typeof status === 'string'
  const hasBase = base_amount != null && base_amount !== ''

  if (!hasStatus && !hasBase) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const valid = ['received', 'in_progress', 'confirmed', 'paid']
  if (hasStatus && !valid.includes(status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })

  // ② % reward needs a real-amount base. Determine if this deal is rate-based.
  const { data: ctx } = await supabase
    .from('deals')
    .select('channel, amount, base_amount, reward_snapshot, services(coop_rate, coop_base)')
    .eq('id', id)
    .single()

  const svc = (ctx?.services ?? null) as { coop_rate: number | null; coop_base: string | null } | null
  const snap = (ctx?.reward_snapshot ?? null) as { ref_type?: string; ref_value?: number; ref_base?: string } | null
  let rate: number | null = null
  let baseLabel = '売上'
  if (ctx?.channel === 'cooperation') { rate = svc?.coop_rate ?? null; baseLabel = svc?.coop_base ?? '売上' }
  else if (snap?.ref_type === 'rate') { rate = Number(snap.ref_value); baseLabel = snap.ref_base ?? '売上' }
  const isRate = rate != null && !Number.isNaN(rate)

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (hasStatus) update.status = status

  // ① Set/edit the actual amount (base) at ANY status → reward = base × rate, recomputed & saved.
  if (isRate && hasBase) {
    const base = Number(base_amount)
    if (Number.isNaN(base) || base <= 0) return NextResponse.json({ error: 'invalid base_amount' }, { status: 400 })
    const computed = Math.round(base * (rate as number) / 100)
    update.base_amount = base
    update.amount = computed
    update.reward_snapshot = { ...(snap ?? {}), base_amount: base, base_label: baseLabel, rate, computed }
  } else if (hasStatus && status === 'confirmed' && isRate) {
    // Confirming a rate deal with no base provided → require it (unless already stored).
    const existing = ctx?.base_amount ?? null
    if (existing == null) {
      return NextResponse.json({ error: 'base_amount required', needsBase: true, baseLabel, rate }, { status: 400 })
    }
    update.amount = Math.round(Number(existing) * (rate as number) / 100)
    update.reward_snapshot = { ...(snap ?? {}), base_amount: Number(existing), base_label: baseLabel, rate, computed: update.amount }
  }

  const { data: deal, error } = await supabase
    .from('deals')
    .update(update)
    .eq('id', id)
    .select('id, customer_name, status, amount, base_amount')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Audit log + Slack only when status actually changed
  if (hasStatus) {
    await supabase.from('deal_events').insert({
      deal_id: id,
      body: `ステータスを「${STATUS_LABEL[status as string]}」に変更しました`,
      created_by: user.id,
      visible_to_partner: ['confirmed', 'paid'].includes(status),
    })
    await notifySlackEvent('status_change', `📋 案件ステータス変更: ${deal?.customer_name ?? id} → ${STATUS_LABEL[status as string]}`)
  }

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
