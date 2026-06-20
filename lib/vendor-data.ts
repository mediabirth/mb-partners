/**
 * vendor ポータル用のデータ取得（読取・本人の delivery に限定）。
 * C-1/C-2 の取得ロジック・隔離はそのまま（service_role で本人の delivery のみ）。
 * 顧客受注額・パートナー報酬・MB粗利・他vendor は一切取得しない（明示 select）。
 */
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor } from '@/lib/vendor-auth'

export type VAssign = { id: string; base_fee: number; assigned_at: string | null; brief: string | null; deal: { id: string; customer_name: string; status: string; created_at: string | null; delivery_brief?: string | null; services: { name: string; icon: string; color: string; logo_path: string | null } | null } | null }
export type VExpense = { id: string; assignment_id: string; kind: string; amount: number; status: string; has_evidence: boolean; created_at: string | null; approved_at: string | null }
export type VPayout = { id: string; amount: number; base_fee: number; expense_total: number; period: string; status: string; paid_at: string | null; frozen_at: string | null }
export type VTask = { id: string; assignment_id: string; title: string; type: string; needs_deliverable: boolean; due_date: string | null; sort: number; status: string; done_at: string | null }
export type VDeliverable = { id: string; assignment_id: string; task_id: string | null; file_name: string | null; note: string | null; created_at: string | null; has_file: boolean }
export type VUpdate = { id: string; assignment_id: string; kind: string; body: string; status: string | null; created_at: string | null }
export type VendorBundle = {
  userId: string
  profile: { name: string | null; color: string | null; avatar_url: string | null }
  delivery: { id: string; name: string; kind: string | null }
  assignments: VAssign[]
  expenses: VExpense[]
  payouts: VPayout[]
  tasks: VTask[]
  deliverables: VDeliverable[]
  updates: VUpdate[]
}

export async function loadVendorBundle(): Promise<VendorBundle | null> {
  const v = await resolveVendor()
  if (!v) return null
  const admin = await createServiceRoleClient()

  const [{ data: prof }, { data: dlv }] = await Promise.all([
    admin.from('profiles').select('name, color, avatar_url').eq('id', v.userId).maybeSingle(),
    admin.from('deliveries').select('id, name, kind').eq('id', v.deliveryId).maybeSingle(),
  ])

  // 【perf】3サーフェスのうち vendor だけ逐次await の waterfall で残っていた取得を、console/app と同じ並列方式へ。
  // クエリ文字列・select・order・map はすべて不変（取得結果は同一）。実行のみ並列化して往復段数を ~6→2 に短縮。
  // throw時に null を返すヘルパ（best-effort テーブルの耐性を維持しつつ Promise.all を rejectさせない）。
  const q = (p: PromiseLike<{ data: unknown }>) =>
    Promise.resolve(p).then(r => (r.data as Record<string, unknown>[] | null), () => null)

  // 並列ステップ1：assignments(delivery_id) と payouts(delivery_id) は相互独立 → 同時実行。
  const assignmentsP: Promise<Record<string, unknown>[] | null> = (async () => {
    // V-1 の delivery_brief を同梱（列未追加でも壊さないよう staged フォールバック）。
    let raw = (await admin
      .from('delivery_assignments')
      .select('id, base_fee, assigned_at, deals(id, customer_name, status, created_at, delivery_brief, services(name, icon, color, logo_path))')
      .eq('delivery_id', v.deliveryId)
      .order('assigned_at', { ascending: false })).data as Record<string, unknown>[] | null
    if (!raw) {
      raw = (await admin
        .from('delivery_assignments')
        .select('id, base_fee, assigned_at, deals(id, customer_name, status, created_at, services(name, icon, color, logo_path))')
        .eq('delivery_id', v.deliveryId)
        .order('assigned_at', { ascending: false })).data as Record<string, unknown>[] | null
    }
    return raw
  })()
  const payoutsP = admin
    .from('delivery_payout_items')
    .select('id, amount, base_fee, expense_total, period, status, paid_at, frozen_at')
    .eq('delivery_id', v.deliveryId)
    .order('period', { ascending: false })

  const [rawAssigns, payoutsRes] = await Promise.all([assignmentsP, payoutsP])
  const pos = payoutsRes.data

  const assignments: VAssign[] = (rawAssigns ?? []).map((a: Record<string, unknown>) => {
    const deal = (a.deals as VAssign['deal']) ?? null
    return { id: a.id as string, base_fee: (a.base_fee as number) ?? 0, assigned_at: (a.assigned_at as string) ?? null, brief: deal?.delivery_brief ?? null, deal }
  })

  const assignIds = assignments.map(a => a.id)
  // 並列ステップ2：tasks / deliverables / updates / expenses は assignIds のみ依存 → 同時実行（best-effort）。
  let tasks: VTask[] = [], deliverables: VDeliverable[] = [], updates: VUpdate[] = [], expenses: VExpense[] = []
  if (assignIds.length) {
    const [tData, dData, uData, eData] = await Promise.all([
      q(admin.from('delivery_tasks').select('id, delivery_assignment_id, title, type, needs_deliverable, due_date, sort, status, done_at').in('delivery_assignment_id', assignIds).order('sort', { ascending: true })),
      q(admin.from('delivery_deliverables').select('id, delivery_assignment_id, task_id, file_name, file_path, note, created_at').in('delivery_assignment_id', assignIds).order('created_at', { ascending: false })),
      q(admin.from('delivery_updates').select('id, delivery_assignment_id, kind, body, status, created_at').in('delivery_assignment_id', assignIds).order('created_at', { ascending: false })),
      q(admin.from('expense_claims').select('id, delivery_assignment_id, kind, amount, status, evidence_path, created_at, approved_at').in('delivery_assignment_id', assignIds).order('created_at', { ascending: false })),
    ])
    tasks = (tData ?? []).map((t: Record<string, unknown>) => ({ id: t.id as string, assignment_id: t.delivery_assignment_id as string, title: t.title as string, type: t.type as string, needs_deliverable: !!t.needs_deliverable, due_date: (t.due_date as string) ?? null, sort: (t.sort as number) ?? 0, status: t.status as string, done_at: (t.done_at as string) ?? null }))
    deliverables = (dData ?? []).map((d: Record<string, unknown>) => ({ id: d.id as string, assignment_id: d.delivery_assignment_id as string, task_id: (d.task_id as string) ?? null, file_name: (d.file_name as string) ?? null, note: (d.note as string) ?? null, created_at: (d.created_at as string) ?? null, has_file: !!d.file_path }))
    updates = (uData ?? []).map((u: Record<string, unknown>) => ({ id: u.id as string, assignment_id: u.delivery_assignment_id as string, kind: u.kind as string, body: u.body as string, status: (u.status as string) ?? null, created_at: (u.created_at as string) ?? null }))
    expenses = (eData ?? []).map((e: Record<string, unknown>) => ({ id: e.id as string, assignment_id: e.delivery_assignment_id as string, kind: e.kind as string, amount: (e.amount as number) ?? 0, status: e.status as string, has_evidence: !!e.evidence_path, created_at: (e.created_at as string) ?? null, approved_at: (e.approved_at as string) ?? null }))
  }

  return {
    userId: v.userId,
    profile: { name: prof?.name ?? v.deliveryName, color: prof?.color ?? '#4733E6', avatar_url: (prof as { avatar_url?: string | null } | null)?.avatar_url ?? null },
    delivery: { id: v.deliveryId, name: dlv?.name ?? v.deliveryName, kind: dlv?.kind ?? null },
    assignments, expenses, payouts: (pos ?? []) as VPayout[],
    tasks, deliverables, updates,
  }
}

/** vendor 通知（既存データからの導出・DDLなし）。経費承認/却下・支払凍結/完了・案件アサインを時系列に。 */
export type VNotif = { id: string; icon: 'ok' | 'ng' | 'pay' | 'freeze' | 'assign'; title: string; sub: string; at: string; href?: string }
export function deriveVendorNotifs(b: VendorBundle): VNotif[] {
  const labelOf = (assignId: string) => b.assignments.find(a => a.id === assignId)?.deal?.customer_name ?? '案件'
  const out: VNotif[] = []
  for (const e of b.expenses) {
    if (e.status === 'approved') out.push({ id: 'e' + e.id, icon: 'ok', title: '経費が承認されました', sub: `${e.kind} ¥${e.amount.toLocaleString()} · ${labelOf(e.assignment_id)}`, at: e.approved_at ?? e.created_at ?? '', href: `/vendor/cases/${e.assignment_id}` })
    else if (e.status === 'rejected') out.push({ id: 'e' + e.id, icon: 'ng', title: '経費が却下されました', sub: `${e.kind} ¥${e.amount.toLocaleString()} · ${labelOf(e.assignment_id)}`, at: e.created_at ?? '', href: `/vendor/cases/${e.assignment_id}` })
  }
  for (const p of b.payouts) {
    if (p.status === 'paid') out.push({ id: 'p' + p.id, icon: 'pay', title: '支払が完了しました', sub: `${p.period} · ¥${p.amount.toLocaleString()}`, at: p.paid_at ?? p.frozen_at ?? '', href: '/vendor/rewards' })
    else out.push({ id: 'p' + p.id, icon: 'freeze', title: '支払予定が確定しました', sub: `${p.period} · ¥${p.amount.toLocaleString()}（未払い）`, at: p.frozen_at ?? '', href: '/vendor/rewards' })
  }
  for (const a of b.assignments) {
    out.push({ id: 'a' + a.id, icon: 'assign', title: '案件にアサインされました', sub: `${a.deal?.customer_name ?? '案件'} · 委託費 ¥${a.base_fee.toLocaleString()}`, at: a.assigned_at ?? '', href: `/vendor/cases/${a.id}` })
  }
  return out.filter(n => n.at).sort((x, y) => (y.at).localeCompare(x.at))
}
