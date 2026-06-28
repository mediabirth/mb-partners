/**
 * POST /api/vendor/schedule — ベンダーが MB 提示の候補日から日程を選んで確定（双方向）。
 * body: { schedule_id, chosen_date }。本人の割当のスケジュールか検証して confirmed に。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor, assertOwnAssignment } from '@/lib/vendor-auth'

export async function POST(req: NextRequest) {
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const b = await req.json()
  if (!b.schedule_id || !b.chosen_date) return NextResponse.json({ error: 'schedule_id と chosen_date は必須です' }, { status: 400 })

  const admin = await createServiceRoleClient()
  const { data: row } = await admin.from('delivery_schedule').select('id, delivery_assignment_id, proposed_dates').eq('id', b.schedule_id).maybeSingle()
  if (!row) return NextResponse.json({ error: '日程が見つかりません' }, { status: 404 })
  if (!(await assertOwnAssignment(vendor.deliveryId, row.delivery_assignment_id as string)))
    return NextResponse.json({ error: 'この日程を確定する権限がありません' }, { status: 403 })
  // 候補日に含まれる日付のみ確定可
  const cands = (row.proposed_dates as string[] | null) ?? []
  if (cands.length && !cands.includes(b.chosen_date)) return NextResponse.json({ error: '候補日から選んでください' }, { status: 400 })

  const { data, error } = await admin.from('delivery_schedule')
    .update({ status: 'confirmed', event_date: b.chosen_date })
    .eq('id', b.schedule_id).select('id, status, event_date').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ schedule: data })
}
