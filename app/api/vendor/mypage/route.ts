/**
 * PATCH /api/vendor/mypage — ベンダー本人のプロフィール編集（非KYC項目のみ）。
 * 編集可: nickname（表示名）・phone・address。
 * KYC確定項目（name・tax_type・銀行/口座/名義・invoice_number）は本ルートでは変更不可（KYC経路のみ）。
 * 本人の delivery に限定（resolveVendor＝linkage）。money非接触。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor } from '@/lib/vendor-auth'

export const runtime = 'edge'

export async function PATCH(req: NextRequest) {
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('nickname' in body) patch.nickname = (typeof body.nickname === 'string' ? body.nickname.trim() : '') || null
  if ('phone' in body) patch.phone = (typeof body.phone === 'string' ? body.phone.trim() : '') || null
  if ('address' in body) patch.address = (typeof body.address === 'string' ? body.address.trim() : '') || null
  // 編集可能キー以外は無視（KYC項目・money項目は絶対に触れない）。
  if (Object.keys(patch).length === 1) return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const { error } = await admin.from('deliveries').update(patch).eq('id', vendor.deliveryId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
