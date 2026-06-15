/**
 * POST /api/console/payouts/freeze-overrides  (owner)
 * 既存の closed/paid バッチの override を「現時点の料率・紐づけ・金額」で凍結（backfill）。
 * payout_overrides テーブル作成後に一度実行すれば、過去月の支払額が以後動かなくなる。冪等。
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { freezeOverridesForBatch } from '@/lib/frontier-payout'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'owner') return NextResponse.json({ error: 'Forbidden — owner only' }, { status: 403 })

  const admin = await createServiceRoleClient()
  const { data: batches, error } = await admin
    .from('payout_batches').select('id, month, status')
    .in('status', ['closed', 'paid'])
    .order('month')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const results: { month: string; frozen: boolean }[] = []
  for (const b of batches ?? []) {
    const ym = String(b.month).slice(0, 7)
    const ok = await freezeOverridesForBatch(admin, b.id, ym)
    results.push({ month: ym, frozen: ok })
  }
  const tableMissing = results.length > 0 && results.every(r => !r.frozen)
  return NextResponse.json({ ok: !tableMissing, results, hint: tableMissing ? 'payout_overrides 未作成の可能性（SQL適用が必要）' : undefined })
}
