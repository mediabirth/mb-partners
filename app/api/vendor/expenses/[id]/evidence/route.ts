/**
 * GET /api/vendor/expenses/[id]/evidence — vendor 自身の経費の領収書を短期署名URLで閲覧。
 * service_role で実行。対象経費が本人の delivery に属することを検証してから 60 秒の signed URL を発行。
 * バケットは非公開のまま。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor } from '@/lib/vendor-auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()

  // 経費 → 割当 → delivery が本人か検証
  const { data: exp } = await admin
    .from('expense_claims')
    .select('id, evidence_path, delivery_assignment_id, delivery_assignments(delivery_id)')
    .eq('id', id).maybeSingle()
  const assignment = exp?.delivery_assignments as unknown as { delivery_id: string } | null
  const owns = exp && assignment?.delivery_id === vendor.deliveryId
  if (!exp || !owns) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!exp.evidence_path) return NextResponse.json({ error: '領収書が添付されていません' }, { status: 404 })

  const { data: signed, error } = await admin.storage.from('expense-evidence').createSignedUrl(exp.evidence_path, 60)
  if (error || !signed) return NextResponse.json({ error: error?.message ?? '署名URLの発行に失敗しました' }, { status: 500 })
  return NextResponse.json({ url: signed.signedUrl, expiresIn: 60 })
}
