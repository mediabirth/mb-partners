/**
 * 案件明細（deal_items）— コンソール運営編集。
 * GET  /api/console/deals/[id]/items   — 明細一覧（サービス名付き）
 * POST /api/console/deals/[id]/items   — 明細追加（成約前のみ）
 * confirmed/paid はロック（サーバ側ガードで拒否）。追加のたび deals.amount=Σ を再計算。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { recomputeDealAmount } from '@/lib/deal-items-recompute'

async function requireConsole(supabase: Awaited<ReturnType<typeof createClient>>, write = false) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return null
  if (write && !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return user
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireConsole(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data, error } = await admin
    .from('deal_items').select('id, service_id, menu_id, kind, amount, base_amount, sort, services(name)')
    .eq('deal_id', id).order('sort')
  if (error) return NextResponse.json({ items: [], ready: false })
  return NextResponse.json({ items: data ?? [], ready: true })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await requireConsole(supabase, true))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()

  const { data: deal } = await admin.from('deals').select('status, service_id, menu_id, channel').eq('id', id).single()
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
  if (!['received', 'in_progress'].includes(deal.status)) {
    return NextResponse.json({ error: '成約後の案件は明細を編集できません' }, { status: 409 })
  }

  const b = await req.json()
  if (!b.service_id) return NextResponse.json({ error: 'service_id は必須です' }, { status: 400 })
  const kind = b.kind === 'rate' ? 'rate' : 'fixed'
  const row = {
    deal_id: id,
    service_id: b.service_id,
    menu_id: b.menu_id || null,
    kind,
    amount: kind === 'fixed' ? Math.max(0, Math.round(Number(b.amount) || 0)) : 0,
    base_amount: kind === 'rate' && b.base_amount != null && b.base_amount !== '' ? Math.max(0, Math.round(Number(b.base_amount))) : null,
    sort: Number(b.sort) || 0,
  }
  const { data: item, error } = await admin.from('deal_items').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })

  // L3: 相談案件（service未割当）に最初の明細を追加 → 主明細サービスを deals.service_id に埋める（1:1表示互換）。
  // 協力なら、このタイミングで協力タスクをテンプレから実体化（is_consultation は履歴として残す）。
  if (!deal.service_id) {
    try {
      await admin.from('deals').update({ service_id: b.service_id, menu_id: b.menu_id || null }).eq('id', id)
      if (deal.channel === 'cooperation') {
        const { instantiateDealTasks } = await import('@/lib/coop-tasks')
        await instantiateDealTasks(admin, { id, service_id: b.service_id, menu_id: b.menu_id || null, channel: 'cooperation' })
      }
    } catch { /* best-effort */ }
  }

  const r = await recomputeDealAmount(admin, id)
  return NextResponse.json({ item, dealAmount: r.total })
}
