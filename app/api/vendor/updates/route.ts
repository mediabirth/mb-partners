/**
 * POST /api/vendor/updates — vendor が進捗メモ/課題フラグを投稿（本人の割当へ）。
 *   body: { delivery_assignment_id, kind('note'|'flag'), body }
 *   flag は status='open' で作成（resolve は MB 側）。service_role＋本人検証。お金ロジック非接触。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor, assertOwnAssignment } from '@/lib/vendor-auth'

export async function POST(req: NextRequest) {
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  const assignmentId = String(b.delivery_assignment_id ?? '').trim()
  const kind = b.kind === 'flag' ? 'flag' : 'note'
  const body = String(b.body ?? '').trim().slice(0, 1000)
  if (!assignmentId || !body) return NextResponse.json({ error: 'delivery_assignment_id と body は必須です' }, { status: 400 })
  if (!(await assertOwnAssignment(vendor.deliveryId, assignmentId))) return NextResponse.json({ error: 'この割当に投稿する権限がありません' }, { status: 403 })

  const admin = await createServiceRoleClient()
  const { data, error } = await admin.from('delivery_updates').insert({
    delivery_assignment_id: assignmentId, kind, body, status: kind === 'flag' ? 'open' : null, created_by: vendor.userId,
  }).select('id, kind, body, status, created_at').single()
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  if (kind === 'flag') { try { const { sendSlack } = await import('@/lib/notify'); await sendSlack(`🚩 課題フラグ: ${vendor.deliveryName} — ${body.slice(0, 80)}`) } catch { /* best-effort */ } }
  return NextResponse.json({ update: data })
}
