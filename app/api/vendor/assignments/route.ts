/**
 * GET /api/vendor/assignments — 経費申請シートの「対象案件」選択肢（本人の割当のみ・最小情報）。
 * service_role で本人の delivery に限定（C-1/C-2 の隔離を踏襲）。
 */
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor } from '@/lib/vendor-auth'

export async function GET() {
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data } = await admin
    .from('delivery_assignments')
    .select('id, base_fee, deals(customer_name, services(name))')
    .eq('delivery_id', vendor.deliveryId)
    .order('assigned_at', { ascending: false })
  const options = (data ?? []).map((a: Record<string, unknown>) => {
    const deal = a.deals as { customer_name?: string; services?: { name?: string } | null } | null
    return { id: a.id as string, label: deal?.customer_name || deal?.services?.name || '案件', base_fee: (a.base_fee as number) ?? 0 }
  })
  return NextResponse.json({ assignments: options })
}
