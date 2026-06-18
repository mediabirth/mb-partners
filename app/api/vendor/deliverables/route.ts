/**
 * POST /api/vendor/deliverables — vendor が成果物をアップロード（本人の割当へ）。
 *   multipart/form-data: delivery_assignment_id, task_id?(任意), note?, file(必須)
 *   service_role で本人の割当か検証→ private bucket delivery-files にサーバ保存→ delivery_deliverables 挿入。
 *   vendor の DB/Storage 直書込はしない（C-2同様）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor, assertOwnAssignment } from '@/lib/vendor-auth'

export async function POST(req: NextRequest) {
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData()
  const assignmentId = String(form.get('delivery_assignment_id') ?? '').trim()
  const taskId = form.get('task_id') ? String(form.get('task_id')).trim() : null
  const note = form.get('note') ? String(form.get('note')).trim().slice(0, 500) : null
  const file = form.get('file')
  if (!assignmentId) return NextResponse.json({ error: 'delivery_assignment_id required' }, { status: 400 })
  if (!file || typeof file === 'string' || (file as File).size === 0) return NextResponse.json({ error: 'ファイルを選択してください' }, { status: 400 })
  if (!(await assertOwnAssignment(vendor.deliveryId, assignmentId))) return NextResponse.json({ error: 'この割当に成果物を提出する権限がありません' }, { status: 403 })

  const admin = await createServiceRoleClient()
  const f = file as File
  const safeName = (f.name || 'file').replace(/[^\w.\-]+/g, '_').slice(-100)
  const path = `${vendor.deliveryId}/${assignmentId}/${crypto.randomUUID()}-${safeName}`
  const buf = new Uint8Array(await f.arrayBuffer())
  const { error: upErr } = await admin.storage.from('delivery-files').upload(path, buf, { contentType: f.type || 'application/octet-stream', upsert: false })
  if (upErr) return NextResponse.json({ error: `アップロード失敗: ${upErr.message}` }, { status: 500 })

  const { data, error } = await admin.from('delivery_deliverables').insert({
    delivery_assignment_id: assignmentId, task_id: taskId, file_path: path, file_name: f.name || safeName, uploaded_by: vendor.userId, note,
  }).select('id, file_name').single()
  if (error) {
    await admin.storage.from('delivery-files').remove([path]).catch(() => {})
    return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  }
  try { const { sendSlack } = await import('@/lib/notify'); await sendSlack(`📦 成果物が提出されました: ${vendor.deliveryName}（${f.name}）`) } catch { /* best-effort */ }
  return NextResponse.json({ deliverable: data })
}
