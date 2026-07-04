/**
 * 案件明細 個別操作（コンソール運営・成約前のみ）。
 * PATCH  /api/console/deals/[id]/items/[itemId]  — 編集（service_id/menu_id/kind/amount/base_amount）
 * DELETE /api/console/deals/[id]/items/[itemId]  — 削除
 * confirmed/paid はロック。変更のたび deals.amount=Σ を再計算。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { recomputeDealAmount } from '@/lib/deal-items-recompute'

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return !!profile && ['owner', 'manager', 'admin'].includes(profile.role)
}

async function ensureEditable(admin: Awaited<ReturnType<typeof createServiceRoleClient>>, dealId: string) {
  const { data: deal } = await admin.from('deals').select('status').eq('id', dealId).single()
  if (!deal) return { ok: false, code: 404, msg: 'Deal not found' }
  if (!['received', 'in_progress'].includes(deal.status)) return { ok: false, code: 409, msg: '成約後の案件は明細を編集できません' }
  return { ok: true as const }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const b = await req.json()
  const guard = await ensureEditable(admin, id)
  if (!guard.ok) {
    // ライフサイクル: 受注額（売上）のみ confirmed でも修正可（勝彦フロー「成約ダイアログで入力済・ここでは修正可」）。
    // 報酬系（amount/base_amount/kind/service/menu）は従来どおり成約後ロック＝確定ガード不変。
    // revenue は報酬計算に不使用（P&L表示専用）のため recompute も走らせない＝deals.amount 完全非接触。
    const keys = Object.keys(b)
    const revenueOnly = keys.length > 0 && keys.every(k => k === 'revenue')
    const { data: deal } = await admin.from('deals').select('status').eq('id', id).single()
    if (!(revenueOnly && deal?.status === 'confirmed')) {
      return NextResponse.json({ error: guard.msg }, { status: guard.code })
    }
    const rev = b.revenue === null || b.revenue === '' ? null : Math.max(0, Math.round(Number(b.revenue)))
    const { error } = await admin.from('deal_items').update({ revenue: rev, updated_at: new Date().toISOString() }).eq('id', itemId).eq('deal_id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.service_id === 'string') patch.service_id = b.service_id
  if ('menu_id' in b) patch.menu_id = b.menu_id || null
  if (b.kind === 'fixed' || b.kind === 'rate') patch.kind = b.kind
  if (b.amount != null && b.amount !== '') patch.amount = Math.max(0, Math.round(Number(b.amount) || 0))
  if ('base_amount' in b) patch.base_amount = b.base_amount === null || b.base_amount === '' ? null : Math.max(0, Math.round(Number(b.base_amount)))
  // A1: 受注額（売上）。報酬計算には使わない＝recompute は revenue を無視（deals.amount 不変）。
  if ('revenue' in b) patch.revenue = b.revenue === null || b.revenue === '' ? null : Math.max(0, Math.round(Number(b.revenue)))

  const { error } = await admin.from('deal_items').update(patch).eq('id', itemId).eq('deal_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const r = await recomputeDealAmount(admin, id)
  return NextResponse.json({ ok: true, dealAmount: r.total })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const guard = await ensureEditable(admin, id)
  if (!guard.ok) return NextResponse.json({ error: guard.msg }, { status: guard.code })

  const { error } = await admin.from('deal_items').delete().eq('id', itemId).eq('deal_id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const r = await recomputeDealAmount(admin, id)
  return NextResponse.json({ ok: true, dealAmount: r.total })
}
