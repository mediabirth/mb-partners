/**
 * 継続報酬の月次レコード（continuous_payouts）操作（owner/manager）。
 * GET   ?deal_id=...        — 案件の月次一覧（period_month 昇順）
 * POST  {deal_id, period_month, gross_input}        — 今月分を確定（confirmed_amount = round(gross × 率/100)）
 * PATCH {deal_id, months}   — 案件の継続期間（deals.continuous_months）を変更
 * ★率は deal.reward_snapshot に凍結された reward_value を正とする（メニュー側が後で変わっても確定済みは不変）。
 *   月次確定額の式は round(gross × rate/100)＝既存 reward 計算式と同一・byte-unchanged。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { parseAmount } from '@/lib/num'

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  return !!profile && ['owner', 'manager', 'admin'].includes(profile.role)
}

// period_month を月初の date 文字列(YYYY-MM-01)へ正規化
function monthStart(v: string): string | null {
  const m = String(v).match(/^(\d{4})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-01` : null
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const dealId = new URL(req.url).searchParams.get('deal_id')
  if (!dealId) return NextResponse.json({ error: 'deal_id は必須です' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('continuous_payouts').select('*').eq('deal_id', dealId).order('period_month')
  if (error) return NextResponse.json({ error: error.message, rows: [] }, { status: 200 })
  return NextResponse.json({ rows: data ?? [] })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  if (!b.deal_id) return NextResponse.json({ error: 'deal_id は必須です' }, { status: 400 })
  const period = monthStart(b.period_month || '')
  if (!period) return NextResponse.json({ error: '対象月（YYYY-MM）が不正です' }, { status: 400 })

  const admin = await createServiceRoleClient()
  // 率は deal の凍結スナップショットから（メニュー変更の影響を受けない）
  const { data: deal } = await admin.from('deals').select('id, reward_ref, reward_snapshot').eq('id', b.deal_id).single()
  if (!deal) return NextResponse.json({ error: '案件が見つかりません' }, { status: 404 })
  const snap = (deal.reward_snapshot ?? {}) as { reward_type?: string; reward_value?: number }
  if (snap.reward_type !== 'continuous') return NextResponse.json({ error: 'この案件は継続報酬ではありません' }, { status: 400 })
  const rate = Number(snap.reward_value ?? 0)
  const gross = parseAmount(b.gross_input)
  // ★月次報酬＝round(gross × rate/100)。既存 reward 計算式と同一。
  const confirmed = Math.round(gross * rate / 100)

  const row = {
    deal_id: b.deal_id,
    reward_ref: deal.reward_ref ?? null,
    period_month: period,
    gross_input: gross,
    confirmed_amount: confirmed,
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
  }
  // 1案件1月1件（unique deal_id+period_month）→ upsert
  const { data, error } = await admin.from('continuous_payouts')
    .upsert(row, { onConflict: 'deal_id,period_month' }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ row: data })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  if (!b.deal_id) return NextResponse.json({ error: 'deal_id は必須です' }, { status: 400 })
  const months = parseAmount(b.months) || null
  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('deals').update({ continuous_months: months }).eq('id', b.deal_id).select('id, continuous_months').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deal: data })
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id は必須です' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('continuous_payouts').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
