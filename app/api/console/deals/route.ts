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
    // D: メニュー（任意・service_menusマスタid）。deals.menu_id＝表示用（ブランド ─ メニュー）／deal_items.menu_id＝明細メタ。
    //   reward計算は起動しない（amount=0固定）＝menu_idを受けても報酬には一切影響しない。
    const menuId = body.menu_id || null
    const { data: d, error: e } = await admin
      .from('deals')
      .insert({
        customer_name, service_id, menu_id: menuId, channel: 'referral', source: 'manual',
        status: 'confirmed', amount: 0, partner_id: sysId,
        intake_type: 'direct', project_status: '未着手',
        internal_memo: internal_memo ?? null, consent: true,
      })
      .select('id, customer_name, channel, source, status, amount, created_at, service_id, intake_type, project_status, services(name, icon, color)')
      .single()
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    // 明細1行：amount=0（パートナー報酬なし）／revenue=受注額（MB粗利）。
    // D: 作成した明細idをadditiveに返す（起票直後のデリバリー割当 POST deliveries が deal_item_id に使う）。
    let item: { id: string } | null = null
    try {
      const { data: it } = await admin.from('deal_items')
        .insert({ deal_id: d.id, service_id, menu_id: menuId, kind: 'fixed', amount: 0, base_amount: null, revenue, sort: 0 })
        .select('id').single()
      item = (it as { id: string } | null) ?? null
    } catch { /* best-effort */ }
    // P0-a: 系統連動レートの条件凍結（直営=confirmed直行のためここで確定条件を凍結・best-effort）。仕様正典 v2 §2。
    try {
      const { freezeFeeSnapshot } = await import('@/lib/supplier-fee')
      await freezeFeeSnapshot(admin, d.id, { partnerId: sysId, serviceId: service_id })
    } catch { /* best-effort */ }
    await notifySlackEvent('new_deal', `🆕 直営業プロジェクト起票: ${customer_name}`)
    return NextResponse.json({ deal: d, item })
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

  // P0-a: 系統連動レートの条件凍結（手動登録=パートナー無し・暫定条件・best-effort）。仕様正典 v2 §2。
  try {
    const [{ freezeFeeSnapshot }, { createServiceRoleClient: mkAdmin }] = await Promise.all([import('@/lib/supplier-fee'), import('@/lib/supabase/server')])
    await freezeFeeSnapshot(await mkAdmin(), deal.id, { partnerId: null, serviceId: service_id })
  } catch { /* best-effort */ }

  await notifySlackEvent('new_deal', `🆕 新規案件（手動登録）: ${customer_name}`)

  return NextResponse.json({ deal })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // owner認証では nested partners.profiles が RLS で null になるため、所有確認済みで service role 読取
  const admin = await createServiceRoleClient()
  const SEL_BASE = `
      id, customer_name, customer_type, company_name, contact_name, contact_title, customer_email, channel, source, status, amount, base_amount,
      fixed_month, created_at, service_id, menu_id, partner_id, reward_snapshot, reward_ref, continuous_months, fee_snapshot,
      service_menus(name, coop_enabled, coop_type, coop_value, coop_base),
      services(name, icon, color, logo_path),
      partners(code, frontier_id, frontier_linked_at, profiles(name, color))`
  // 無音A(2026-07-18): 相互独立な取得（役割確認・deals本体・副テーブル5本=元々未フィルタ全量・menus全量・menu_rewards(fixed)・directors・supplierFrontiers）を1段に統合。
  //   従来は5〜7段の直列往復（実測520ms）→1〜2段へ。select・集計ロジック・結果は完全不変（並べ替えのみ）。
  const safeQ0 = (p2: PromiseLike<{ data: unknown }>) => Promise.resolve(p2).then(r => r, () => ({ data: null as unknown }))
  const { dealFrontierOverride } = await import('@/lib/pnl')
  const { loadSupplierFrontiers } = await import('@/lib/frontier-payout')
  const [profileRes, dealsR1, dasR, expsR, tksR, upsR, dvbR, menusAllR, mrsAllR, directorsR, supplierFrontiers] = await Promise.all([
    supabase.from('profiles').select('name, role, color').eq('id', user.id).single(),
    admin.from('deals')
      .select(`${SEL_BASE}, delivery_brief, intake_type, project_status, review_stage, lost_at, lost_reason, lost_note, director_id, other_cost, deal_items(id, service_id, kind, amount, base_amount, revenue, sort, services(name))`)
      .order('created_at', { ascending: false }).then(r => r, () => ({ data: null })),
    safeQ0(admin.from('delivery_assignments').select('id, deal_id, deal_item_id, delivery_id, base_fee, status, deliveries(name, kind)')),
    safeQ0(admin.from('expense_claims').select('id, delivery_assignment_id, kind, amount, evidence_path, status, approved_at, note, created_at').order('created_at', { ascending: true })),
    safeQ0(admin.from('delivery_tasks').select('id, delivery_assignment_id, title, type, needs_deliverable, due_date, sort, status, done_at').order('sort', { ascending: true })),
    safeQ0(admin.from('delivery_updates').select('id, delivery_assignment_id, kind, body, status, created_at').order('created_at', { ascending: false })),
    safeQ0(admin.from('delivery_deliverables').select('id, delivery_assignment_id, task_id, file_name, note, created_at').order('created_at', { ascending: false })),
    safeQ0(admin.from('menus').select('id, name')),
    safeQ0(admin.from('menu_rewards').select('menu_id, reward_type, reward_value, active').eq('active', true).eq('reward_type', 'fixed')),
    admin.from('profiles').select('id, name, role, color').neq('role', 'partner').order('name'),
    loadSupplierFrontiers(admin),
  ])
  const profile = profileRes.data
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let deals = dealsR1.data as Record<string, unknown>[] | null
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

  // A2a: デリバリー割当 → 明細単位の割当行＋案件合計委託費。
  const deliveryByDeal: Record<string, { rows: Record<string, unknown>[]; cost: number }> = {}
  const assignToDeal: Record<string, string> = {}
  for (const a of ((dasR.data ?? []) as Array<Record<string, unknown> & { id: string; deal_id: string; base_fee: number }>)) {
    const ent = (deliveryByDeal[a.deal_id] ??= { rows: [], cost: 0 })
    ent.rows.push(a)
    // ライフサイクル: 委託費が原価として確定するのはベンダー了承後（accepted / delivered / 旧既定値 assigned）。
    // proposed（提示中）・declined（辞退）は原価に算入しない＝勝彦フロー「了承→アサイン確定で委託費確定」。
    const ast = (a as { status?: string }).status ?? 'assigned'
    if (ast === 'accepted' || ast === 'assigned' || ast === 'delivered') ent.cost += a.base_fee ?? 0
    assignToDeal[a.id] = a.deal_id
  }

  // A2b: 経費申請 → 割当ごとにぶら下げ、承認済(approved)合計を案件別に集計（assignToDeal を使うため das の後）。
  const expensesByAssign: Record<string, unknown[]> = {}
  const approvedExpenseByDeal: Record<string, number> = {}
  for (const e of ((expsR.data ?? []) as Array<{ id: string; delivery_assignment_id: string; amount: number; status: string; evidence_path: string | null }>)) {
    const row = { ...e, has_evidence: !!e.evidence_path }
    ;(expensesByAssign[e.delivery_assignment_id] ??= []).push(row)
    const dealId = assignToDeal[e.delivery_assignment_id]
    if (dealId && e.status === 'approved') approvedExpenseByDeal[dealId] = (approvedExpenseByDeal[dealId] ?? 0) + (e.amount ?? 0)
  }

  // V-1: タスク/メモ/成果物を割当ごとに付与（お金非接触）。
  const tasksByAssign: Record<string, unknown[]> = {}
  const updatesByAssign: Record<string, unknown[]> = {}
  const deliverablesByAssign: Record<string, unknown[]> = {}
  for (const t of ((tksR.data ?? []) as Array<{ delivery_assignment_id: string }>)) (tasksByAssign[t.delivery_assignment_id] ??= []).push(t)
  for (const u of ((upsR.data ?? []) as Array<{ delivery_assignment_id: string }>)) (updatesByAssign[u.delivery_assignment_id] ??= []).push(u)
  for (const x of ((dvbR.data ?? []) as Array<{ delivery_assignment_id: string }>)) (deliverablesByAssign[x.delivery_assignment_id] ??= []).push(x)

  // メニュー名の一括解決（APP正典 app/app/cases/[id] と同じ流儀）：
  //   reward_snapshot.menu_id → menus.name（お客さま向け新名称を優先）／無ければ service_menus.name。
  //   読取クエリの追加のみ（in検索1回）。テーブル未作成でも安全に空でフォールバック。
  const menuNameById: Record<string, string> = {}
  for (const m of ((menusAllR.data ?? []) as Array<{ id: string; name: string }>)) menuNameById[m.id] = m.name

  // A1: 各案件のフロンティアoverride を読取で算出して付与（既存lib/frontierの式・保存値非接触）。
  // P0-b: 自己サービス抑止＋サプライヤー窓バイパスを支払計算(computeOverrides)と同一規則で表示にも反映（乖離ゼロ）。
  const withOverride = (deals ?? []).map((d: Record<string, unknown>) => {
    const dv = deliveryByDeal[d.id as string]
    return {
      ...d,
      _frontier_override: dealFrontierOverride(
        d as { status: string; amount: number; partner_id?: string | null; fixed_month?: string | null; created_at: string; fee_snapshot?: { self_service?: boolean } | null },
        (d.partners as { frontier_id?: string | null; frontier_linked_at?: string | null } | null) ?? null,
        supplierFrontiers,
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
      // メニュー名（新名称優先→service_menus名）。表示専用メタ・money非接触。
      _menu_name: (() => {
        const snapId = (d.reward_snapshot as { menu_id?: string } | null)?.menu_id
        return (snapId && menuNameById[snapId]) || (d.service_menus as { name?: string | null } | null)?.name || null
      })(),
      _delivery_brief: (d.delivery_brief as string | null) ?? null,
      // F-1: フェーズ導出（純関数・お金非干渉）。intake_type/project_status は列が無ければ undefined（フォールバック済）。
      _phase: phaseOf(d as { intake_type?: string | null; status: string }),
    }
  })

  // ベンダー純化P2: 受注額の乖離琥珀フラグ（vendor-redesign.md §3(b)・表示専用の導出値）。
  //   同一メニュー直近90日の確定済み受注額の中央値±70%（N<3は1桁ずれの緩い帯・N==0はfixed報酬×10からの1桁ずれのみ）。
  //   ★保存/請求/報酬には一切影響しない（判定失敗は静かにフラグなし）。
  try {
    const { judgeDeviation } = await import('@/lib/revenue-flag')
    const { REVENUE_DEVIATION } = await import('@/lib/supplier-fee')
    const revOf = (d: Record<string, unknown>) => (((d.deal_items as { revenue?: number | null }[] | null) ?? [])).reduce((s, it) => s + (Number(it.revenue) || 0), 0)
    const menuOf = (d: Record<string, unknown>) => ((d.reward_snapshot as { menu_id?: string } | null)?.menu_id ?? (d.menu_id as string | null)) || null
    const since = Date.now() - REVENUE_DEVIATION.windowDays * 86400e3
    const peersByMenu: Record<string, { id: string; rev: number }[]> = {}
    for (const d of withOverride as Record<string, unknown>[]) {
      const mid = menuOf(d); const rev = revOf(d)
      if (!mid || rev <= 0 || !['confirmed', 'paid'].includes(d.status as string)) continue
      if (new Date(d.created_at as string).getTime() < since) continue
      ;(peersByMenu[mid] ??= []).push({ id: d.id as string, rev })
    }
    // N==0 メニューの想定受注額（fixed報酬×10）を一括解決
    const zeroPeerMenus = [...new Set((withOverride as Record<string, unknown>[])
      .filter(d => { const mid = menuOf(d); return mid && revOf(d) > 0 && ((peersByMenu[mid] ?? []).filter(p => p.id !== d.id).length === 0) })
      .map(d => menuOf(d) as string))]
    const estByMenu: Record<string, number> = {}
    if (zeroPeerMenus.length) {
      const zp = new Set(zeroPeerMenus)
      for (const r of ((mrsAllR.data ?? []) as { menu_id: string; reward_value: number }[])) {
        if (zp.has(r.menu_id) && Number(r.reward_value) > 0 && !estByMenu[r.menu_id]) estByMenu[r.menu_id] = Number(r.reward_value) * 10
      }
    }
    for (const d of withOverride as Record<string, unknown>[]) {
      const mid = menuOf(d); const rev = revOf(d)
      if (!mid || rev <= 0 || !['confirmed', 'paid'].includes(d.status as string)) { (d as Record<string, unknown>)._rev_flag = null; continue }
      const peers = (peersByMenu[mid] ?? []).filter(p => p.id !== d.id).map(p => p.rev)
      ;(d as Record<string, unknown>)._rev_flag = judgeDeviation(rev, peers, peers.length ? null : (estByMenu[mid] ?? null))
    }
  } catch { /* best-effort: フラグ無しで続行 */ }

  // A1: MB担当の選択肢＝内部メンバー（非partner）。A2a: デリバリー委託先の選択肢。
  const directors = directorsR.data
  let deliveriesList: unknown[] = []
  try {
    // C1: service_id（得意サービス・null=全サービス扱い）を読み取り列に追加＝アサインselectの2群表示に使う。
    const r1 = await admin.from('deliveries').select('id, name, kind, service_id, active').eq('active', true).order('name')
    let dl: unknown[] | null = r1.data
    if (!dl) {
      // service_id 列未適用（completion_deliveries_service_ddl 前）でも従来どおり返す。
      const r2 = await admin.from('deliveries').select('id, name, kind, active').eq('active', true).order('name')
      dl = r2.data
    }
    deliveriesList = dl ?? []
  } catch { /* 未作成 */ }

  return NextResponse.json({ deals: withOverride, profile, directors: directors ?? [], deliveries: deliveriesList })
}
