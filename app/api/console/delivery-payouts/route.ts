/**
 * デリバリー支払管理（独立ストリーム）— コンソール owner/manager。
 * GET  /api/console/delivery-payouts
 *   → { pending: 委託先×月の未凍結支払予定, frozen: 凍結済み明細(delivery_payout_items), deliveryName }
 * POST /api/console/delivery-payouts  body: { delivery_id, period }
 *   → その委託先×月の未凍結ライン（base_fee+承認済経費）をスナップショットして凍結記録（status=unpaid）。
 *
 * パートナー支払(payout_items/close_month_batch)には一切触れない＝別テーブルのみ。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { computeDeliveryPayoutLines, payoutKey } from '@/lib/delivery-payout'

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return user
}

export async function GET() {
  const supabase = await createClient()
  if (!(await requireWrite(supabase))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()

  const { lines, deliveryName } = await computeDeliveryPayoutLines(admin)

  // 凍結済み（delivery_payout_items）。テーブル未作成なら needsMigration。
  let frozen: Record<string, unknown>[] = []
  let frozenKeys = new Set<string>()
  let ready = true
  try {
    const { data, error } = await admin.from('delivery_payout_items')
      .select('id, delivery_id, deal_id, deal_item_id, base_fee, expense_total, amount, period, status, frozen_at, paid_at')
      .order('frozen_at', { ascending: false })
    if (error) throw error
    frozen = data ?? []
    frozenKeys = new Set((data ?? []).map((r: Record<string, unknown>) =>
      payoutKey({ deliveryId: r.delivery_id as string, dealId: r.deal_id as string, dealItemId: (r.deal_item_id as string | null) ?? null, period: r.period as string })))
  } catch { ready = false }

  // 未凍結ライン → 委託先×月で集計
  const pendingMap: Record<string, { delivery_id: string; period: string; baseFee: number; expenseTotal: number; amount: number; count: number }> = {}
  for (const l of lines) {
    if (frozenKeys.has(payoutKey(l))) continue            // 既に凍結済みは除外
    if (l.amount <= 0) continue
    const k = `${l.deliveryId}|${l.period}`
    const e = (pendingMap[k] ??= { delivery_id: l.deliveryId, period: l.period, baseFee: 0, expenseTotal: 0, amount: 0, count: 0 })
    e.baseFee += l.baseFee; e.expenseTotal += l.expenseTotal; e.amount += l.amount; e.count++
  }
  const pending = Object.values(pendingMap).sort((a, b) => b.period.localeCompare(a.period) || b.amount - a.amount)

  return NextResponse.json({ pending, frozen, deliveryName, ready })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = await requireWrite(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()

  const b = await req.json()
  const deliveryId = String(b.delivery_id ?? '').trim()
  const period = String(b.period ?? '').trim()
  if (!deliveryId || !period) return NextResponse.json({ error: 'delivery_id and period required' }, { status: 400 })

  const { lines } = await computeDeliveryPayoutLines(admin)

  // 既存凍結キー（多重凍結防止）
  let frozenKeys = new Set<string>()
  try {
    const { data, error } = await admin.from('delivery_payout_items').select('delivery_id, deal_id, deal_item_id, period')
    if (error) throw error
    frozenKeys = new Set((data ?? []).map((r: Record<string, unknown>) =>
      payoutKey({ deliveryId: r.delivery_id as string, dealId: r.deal_id as string, dealItemId: (r.deal_item_id as string | null) ?? null, period: r.period as string })))
  } catch {
    return NextResponse.json({ error: 'delivery_payout_items 未作成（Phase B DDL 実行が必要）', needsMigration: true }, { status: 200 })
  }

  const rows = lines
    .filter(l => l.deliveryId === deliveryId && l.period === period && l.amount > 0 && !frozenKeys.has(payoutKey(l)))
    .map(l => ({
      delivery_id: l.deliveryId, deal_id: l.dealId, deal_item_id: l.dealItemId,
      base_fee: l.baseFee, expense_total: l.expenseTotal, amount: l.amount,
      period: l.period, status: 'unpaid', frozen_at: new Date().toISOString(),
    }))
  if (rows.length === 0) return NextResponse.json({ error: '凍結対象がありません（既に凍結済み、または対象なし）' }, { status: 409 })

  const { data, error } = await admin.from('delivery_payout_items').insert(rows).select('id, amount')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const total = (data ?? []).reduce((s: number, r: { amount: number }) => s + (r.amount ?? 0), 0)

  // ★ベンダー「メール通知」：委託費が確定したら本人へ通知（best-effort・お金ロジック非接触）。
  // 宛先は deliveries.contact_email、無ければ auth email。Resend 未設定/宛先なしは静かにスキップ。
  try {
    const { data: dlv } = await admin.from('deliveries').select('name, contact_email, auth_user_id').eq('id', deliveryId).maybeSingle()
    let to = (dlv?.contact_email as string) || null
    if (!to && dlv?.auth_user_id) { const { data: u } = await admin.auth.admin.getUserById(dlv.auth_user_id as string); to = u?.user?.email ?? null }
    if (to) {
      const { sendTemplatedEmail } = await import('@/lib/mail-send')
      const mm = period.split('-')[1] ?? ''
      await sendTemplatedEmail({
        key: 'delivery-payout', to, toRole: 'vendor',
        vars: { name: dlv?.name ?? '', month: `${Number(mm)}月`, amount: `¥${total.toLocaleString()}`, link: 'https://mb-partners.app/vendor/rewards' },
        buttons: [{ label: '委託費を確認する', url: 'https://mb-partners.app/vendor/rewards' }],
        meta: { delivery_id: deliveryId, period },
      })
    }
  } catch { /* best-effort：通知失敗は支払凍結に影響しない */ }

  return NextResponse.json({ frozen: data, count: (data ?? []).length, total })
}
