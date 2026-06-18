/**
 * GET /api/vendor/deliverables/[id]/file — 自分が提出した成果物を短期署名URLで開く（バケットは非公開）。
 * 本人検証（割当→delivery）→ 60秒 signed URL。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor } from '@/lib/vendor-auth'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const { data: dl } = await admin
    .from('delivery_deliverables')
    .select('id, file_path, delivery_assignment_id, delivery_assignments(delivery_id)')
    .eq('id', id).maybeSingle()
  const owns = dl && (dl.delivery_assignments as { delivery_id: string } | null)?.delivery_id === vendor.deliveryId
  if (!dl || !owns) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!dl.file_path) return NextResponse.json({ error: 'ファイルがありません' }, { status: 404 })
  const { data: signed, error } = await admin.storage.from('delivery-files').createSignedUrl(dl.file_path, 60)
  if (error || !signed) return NextResponse.json({ error: error?.message ?? '署名URLの発行に失敗しました' }, { status: 500 })
  return NextResponse.json({ url: signed.signedUrl, expiresIn: 60 })
}
