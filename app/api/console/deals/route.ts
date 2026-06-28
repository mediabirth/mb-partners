import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { notifySlackEvent } from '@/lib/slack'
import { phaseOf } from '@/lib/phase'

export const runtime = 'edge'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { customer_name, service_id, channel, source, status, amount, internal_memo } = body
  if (!customer_name || !service_id) return NextResponse.json({ error: 'customer_name and service_id required' }, { status: 400 })

  // 直営業（direct）：商談を経ず confirmed のプロジェクトとして起票。partner_id=MB直営(is_system)・amount=0。
  //   受注額は deal_items.revenue へ（MB粗利に反映／パートナー報酬には一切入らない）。reward計算は起動しない。
  //   close_month は is_system を除外するため、実在パートナーの払出には一切影響しない。
  if (body.intake_type === 'direct') {
    const admin = await createServiceRoleClient()
    const { getSystemPartnerId } = await import('@/lib/system-partner')
    const sysId = await getSystemPartnerId(admin)
    if (!sysId) return NextResponse.json({ error: 'MB直営パートナーが未作成です（is_system seed 要）' }, { status: 409 })
    const revenue = Number(body.revenue ?? 0) || 0
    const { data: d, error: e } = await admin
      .from('deals')
      .insert({
        customer_name, service_id, channel: 'referral', source: 'manual',
        status: 'confirmed', amount: 0, partner_id: sysId,
        intake_type: 'direct', project_status: '未着手',
        internal_memo: internal_memo ?? null, consent: true,
      })
      .select('id, customer_name, channel, source, status, amount, created_at, service_id, intake_type, project_status, services(name, icon, color)')
      .single()
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    // 明細1行：amount=0（パートナー報酬なし）／revenue=受注額（MB粗利）。
    try { await admin.from('deal_items').insert({ deal_id: d.id, service_id, menu_id: null, kind: 'fixed', amount: 0, base_amount: null, revenue, sort: 0 }) } catch { /* best-effort */ }
    await notifySlackEvent('new_deal', `🆕 直営業プロジェクト起票: ${customer_name}`)
    return NextResponse.json({ deal: d })
  }

  const { data: deal, error } = await supabase
    .from('deals')
    .insert({
      customer_name,
      service_id,
      channel: channel ?? 'referral',   // 有効な enum 値（旧 'direct' は deal_channel enum に存在せず不正だった）
      source: source ?? 'manual',
      status: status ?? 'received',
      amount: amount ?? 0,
      internal_memo: internal_memo ?? null,
      consent: true,
    })
    .select('id, customer_name, channel, source, status, amount, created_at, service_id, services(name, icon, color), partners(code, profiles(name, color))')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // L1: 明細1行を同時生成（best-effort・外見不変）。手動登録は固定額（menuなし）。
  try {
    const { createDealItem } = await import('@/lib/deal-items')
    const admin = await createServiceRoleClient()
    await createDealItem(admin, {
      deal_id: deal.id, service_id, menu_id: null, kind: 'fixed', amount: amount ?? 0, base_amount: null,
    })
  } catch { /* best-effort */ }

  await notifySlackEvent('new_deal', `🆕 新規案件（手動登録）: ${customer_name}`)

  return NextResponse.json({ deal })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, color')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // owner認証では nested partners.profiles が RLS で null になるため、所有確認済みで service role 読取
  const admin = await createServiceRoleClient()
  const SEL_BASE = `
      id, customer_name, customer_type, company_name, contact_name, contact_title, channel, source, status, amount, base_amount,
      fixed_month, created_at, service_id, menu_id, partner_id, reward_snapshot, reward_ref, continuous_months,
      service_menus(coop_enabled, coop_type, coop_value, coop_base),
      services(name, icon, color, logo_path),
      partners(code, frontier_id, frontier_linked_at, profiles(name, color))`
  // N失注メタ + L2明細 + A1 P&L(revenue/director_id/other_cost)。列/テーブル未作成なら段階 fallback。
  let { data: deals } = await admin
    .from('deals')
    .select(`${SEL_BASE}, delivery_brief, intake_type, project_status, review_stage, lost_at, lost_reason, lost_note, director_id, other_cost, deal_items(id, service_id, kind, amount, base_amount, revenue, sort, services(name))`)
    .order('created_at', { ascending: false })
  if (!deals) {
    ;({ data: deals } = await admin
      .from('deals')
      .select(`${SEL_BASE}, lost_at, lost_reason, lost_note, deal_items(id, service_id, kind, amount, base_amount, sort, services(name))`)
      .order('created_at', { ascending: false }))
  }
  if (!deals) {
    ;({ data: deals } = await admin
      .from('deals')
      .select(`${SEL_BASE}, lost_at, lost_reason, lost_note`)
      .order('created_at', { ascending: false }))
  }
  if (!deals) {
    ;({ data: deals } = await admin.from('deals').select(SEL_BASE).order('created_at', { ascending: false }))
  }

  // A2a: デリバリー割当を読取（best-effort・テーブル未作成なら空）。明細単位の割当行＋案件合計委託費。
  const deliveryByDeal: Record<string, { rows: Record<string, unknown>[]; cost: number }> = {}
  const assignToDeal: Record<string, string> = {}
  try {
    const { data: das } = await admin
      .from('delivery_assignments')
      .select('id, deal_id, deal_item_id, delivery_id, base_fee, status, deliveries(name, kind)')
    for (const a of (das ?? []) as Array<Record<string, unknown> & { id: string; deal_id: string; base_fee: number }>) {
      const ent = (deliveryByDeal[a.deal_id] ??= { rows: [], cost: 0 })
      ent.rows.push(a)
      ent.cost += a.base_fee ?? 0
      assignToDeal[a.id] = a.deal_id
    }
  } catch { /* テーブル未作成 → 0 */ }

  // A2b: 経費申請を読取（best-effort）。割当ごとにぶら下げ、承認済(approved)合計を案件別に集計。
  const expensesByAssign: Record<string, unknown[]> = {}
  const approvedExpenseByDeal: Record<string, number> = {}
  try {
    const { data: exps } = await admin
      .from('expense_claims')
      .select('id, delivery_assignment_id, kind, amount, evidence_path, status, approved_at, note, created_at')
      .order('created_at', { ascending: true })
    for (const e of (exps ?? []) as Array<{ id: string; delivery_assignment_id: string; amount: number; status: string; evidence_path: string | null }>) {
      const row = { ...e, has_evidence: !!e.evidence_path }
      ;(expensesByAssign[e.delivery_assignment_id] ??= []).push(row)
      const dealId = assignToDeal[e.delivery_assignment_id]
      if (dealId && e.status === 'approved') approvedExpenseByDeal[dealId] = (approvedExpenseByDeal[dealId] ?? 0) + (e.amount ?? 0)
    }
  } catch { /* テーブル未作成 → 0 */ }

  // V-1: デリバリー実行構造（タスク/マイルストーン）＋進捗メモ/フラグ＋成果物を割当ごとに付与（best-effort）。お金非接触。
  const tasksByAssign: Record<string, unknown[]> = {}
  const updatesByAssign: Record<string, unknown[]> = {}
  const deliverablesByAssign: Record<string, unknown[]> = {}
  try {
    const { data: tks } = await admin.from('delivery_tasks')
      .select('id, delivery_assignment_id, title, type, needs_deliverable, due_date, sort, status, done_at')
      .order('sort', { ascending: true })
    for (const t of (tks ?? []) as Array<{ delivery_assignment_id: string }>) (tasksByAssign[t.delivery_assignment_id] ??= []).push(t)
  } catch { /* 未作成 */ }
  try {
    const { data: ups } = await admin.from('delivery_updates')
      .select('id, delivery_assignment_id, kind, body, status, created_at')
      .order('created_at', { ascending: false })
    for (const u of (ups ?? []) as Array<{ delivery_assignment_id: string }>) (updatesByAssign[u.delivery_assignment_id] ??= []).push(u)
  } catch { /* 未作成 */ }
  try {
    const { data: dvb } = await admin.from('delivery_deliverables')
      .select('id, delivery_assignment_id, task_id, file_name, note, created_at')
      .order('created_at', { ascending: false })
    for (const x of (dvb ?? []) as Array<{ delivery_assignment_id: string }>) (deliverablesByAssign[x.delivery_assignment_id] ??= []).push(x)
  } catch { /* 未作成 */ }

  // A1: 各案件のフロンティアoverride を読取で算出して付与（既存lib/frontierの式・保存値非接触）。
  const { dealFrontierOverride } = await import('@/lib/pnl')
  const withOverride = (deals ?? []).map((d: Record<string, unknown>) => {
    const dv = deliveryByDeal[d.id as string]
    return {
      ...d,
      _frontier_override: dealFrontierOverride(
        d as { status: string; amount: number; partner_id?: string | null; fixed_month?: string | null; created_at: string },
        (d.partners as { frontier_id?: string | null; frontier_linked_at?: string | null } | null) ?? null,
      ),
      _deliveries: (dv?.rows ?? []).map(a => ({
        ...a,
        _expenses: expensesByAssign[a.id as string] ?? [],
        _tasks: tasksByAssign[a.id as string] ?? [],
        _updates: updatesByAssign[a.id as string] ?? [],
        _deliverables: deliverablesByAssign[a.id as string] ?? [],
      })),
      _delivery_cost: dv?.cost ?? 0,
      _delivery_expense: approvedExpenseByDeal[d.id as string] ?? 0,
      _delivery_brief: (d.delivery_brief as string | null) ?? null,
      // F-1: フェーズ導出（純関数・お金非干渉）。intake_type/project_status は列が無ければ undefined（フォールバック済）。
      _phase: phaseOf(d as { intake_type?: string | null; status: string }),
    }
  })

  // A1: MB担当の選択肢＝内部メンバー（非partner）。A2a: デリバリー委託先の選択肢。
  const { data: directors } = await admin
    .from('profiles').select('id, name, role, color').neq('role', 'partner').order('name')
  let deliveriesList: unknown[] = []
  try {
    const { data: dl } = await admin.from('deliveries').select('id, name, kind, active').eq('active', true).order('name')
    deliveriesList = dl ?? []
  } catch { /* 未作成 */ }

  return NextResponse.json({ deals: withOverride, profile, directors: directors ?? [], deliveries: deliveriesList })
}
