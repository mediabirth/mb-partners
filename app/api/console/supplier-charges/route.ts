/**
 * サプライヤー請求（P0-a・仕様正典: docs/design/lineage-rate-design.md v2 §4/§7）。
 * GET  — サプライヤー一覧＋凍結済み請求一覧＋（supplier&period指定時）クローズプレビュー
 * POST — 月次請求クローズ＝金額の凍結（第2段）。(a)折半・(b)決済5%・(d)月額 の3種。凍結済みは不変（skip）。
 * ★MBが「請求する」側の独立ドメイン。payout_*（MBが払う側）・reward_snapshot・deals.amount には一切非接触。
 * ★パートナー受取不減額の構造保証＝本テーブルは支払計算のどこからも参照されない。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { loadRateCard, STD_RATE_CARD } from '@/lib/supplier-fee'
import { computeCharges, type ChargeRow } from '@/lib/supplier-charges'

export const runtime = 'nodejs'

async function requireOpsWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager'].includes(profile.role)) return null
  return user
}



export async function GET(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireOpsWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const url = new URL(req.url)
  const supplierId = url.searchParams.get('supplier')
  const period = url.searchParams.get('period')

  // サプライヤー一覧（services.supplier_partner_id の distinct）
  const { data: svc } = await admin.from('services').select('supplier_partner_id').not('supplier_partner_id', 'is', null)
  const ids = [...new Set((svc ?? []).map((s: { supplier_partner_id: string }) => s.supplier_partner_id))]
  let suppliers: { id: string; name: string; code: string | null; rate_card: string }[] = []
  if (ids.length) {
    const { data: ps } = await admin.from('partners').select('id, code, supplier_rate_card, company_name, profiles(name)').in('id', ids)
    suppliers = (ps ?? []).map((p: { id: string; code: string | null; supplier_rate_card: string | null; company_name: string | null; profiles: { name: string | null } | null }) => ({
      id: p.id, code: p.code, name: p.company_name || p.profiles?.name || p.code || p.id.slice(0, 8), rate_card: p.supplier_rate_card ?? STD_RATE_CARD,
    }))
  }

  const { data: charges } = await admin
    .from('supplier_charges')
    .select('id, supplier_partner_id, deal_id, kind, period, base_amount, rate, amount, status, frozen_at, invoiced_at, settled_at, snapshot')
    .order('period', { ascending: false }).order('created_at', { ascending: false }).limit(500)

  let preview: { rows: ChargeRow[]; warnings: string[] } | null = null
  if (supplierId && period && /^\d{4}-\d{2}$/.test(period)) preview = await computeCharges(admin, supplierId, period)

  return NextResponse.json({ suppliers, charges: charges ?? [], preview })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  if (!(await requireOpsWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  const supplierId = typeof b.supplier_partner_id === 'string' ? b.supplier_partner_id : ''
  const period = typeof b.period === 'string' ? b.period : ''
  if (!supplierId || !/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: 'supplier_partner_id と period(YYYY-MM) は必須です' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const { rows, warnings } = await computeCharges(admin, supplierId, period)

  // 凍結済みは不変（skip）＝多重凍結防止（設計§2第2段・invoiced以降は解除も不可）
  const { data: existing } = await admin.from('supplier_charges').select('deal_id, kind').eq('supplier_partner_id', supplierId).eq('period', period)
  const seen = new Set((existing ?? []).map((e: { deal_id: string | null; kind: string }) => `${e.deal_id ?? 'flat'}|${e.kind}`))
  const fresh = rows.filter(r => !seen.has(`${r.deal_id ?? 'flat'}|${r.kind}`))

  if (fresh.length) {
    const { error } = await admin.from('supplier_charges').insert(fresh.map(r => ({ ...r, status: 'unbilled' })))
    if (error) return NextResponse.json({ error: '凍結に失敗しました: ' + error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, frozen: fresh.length, skipped: rows.length - fresh.length, warnings })
}
