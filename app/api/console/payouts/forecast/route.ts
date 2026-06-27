import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { withholdingTax, netAmount } from '@/lib/payout'

export const runtime = 'edge'

/**
 * ④ 締め前「今月の支払見込み」＝当月 confirmed deals の partner別 読み取り集計。
 * ★完全に読み取り専用：close_month_batch RPC を呼ばず、payout_batches/payout_items/payout_overrides・
 *   deals.status に一切書き込まない（SELECT のみ）。源泉は lib/payout の純関数 withholdingTax を再利用。
 * 月の帰属は close_month_batch と同じ（fixed_month があればその月、無ければ created_at の月＝JST）。
 */
function jstYm(d: Date): string {
  const j = new Date(d.getTime() + 9 * 60 * 60_000)
  return `${j.getUTCFullYear()}-${String(j.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = await createServiceRoleClient()
  const month = jstYm(new Date())

  const { data: deals } = await admin
    .from('deals')
    .select('partner_id, amount, fixed_month, created_at, partners(code, tax_type, profiles(name, color))')
    .eq('status', 'confirmed')

  const monthOf = (d: { fixed_month: string | null; created_at: string }) =>
    d.fixed_month ? String(d.fixed_month).slice(0, 7) : jstYm(new Date(d.created_at))

  type Acc = { partner_id: string; name: string; color: string | null; tax_type: string | null; gross: number; count: number }
  const map = new Map<string, Acc>()
  for (const d of (deals ?? []) as unknown as Array<{ partner_id: string | null; amount: number | null; fixed_month: string | null; created_at: string; partners: { code: string; tax_type: string | null; profiles: { name: string; color: string } | null } | null }>) {
    if (!d.partner_id || monthOf(d) !== month) continue
    const cur = map.get(d.partner_id) ?? {
      partner_id: d.partner_id,
      name: d.partners?.profiles?.name ?? d.partners?.code ?? '—',
      color: d.partners?.profiles?.color ?? null,
      tax_type: d.partners?.tax_type ?? null,
      gross: 0, count: 0,
    }
    cur.gross += d.amount ?? 0
    cur.count += 1
    map.set(d.partner_id, cur)
  }

  const items = [...map.values()].map(p => ({
    partner_id: p.partner_id, name: p.name, color: p.color, deal_count: p.count,
    gross: p.gross, withholding: withholdingTax(p.gross, p.tax_type), net: netAmount(p.gross, p.tax_type),
  })).sort((a, b) => b.net - a.net)

  return NextResponse.json({
    month,
    items,
    total_net: items.reduce((s, p) => s + p.net, 0),
    partner_count: items.length,
  })
}
