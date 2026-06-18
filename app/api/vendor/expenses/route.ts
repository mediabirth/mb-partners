/**
 * POST /api/vendor/expenses — vendor 自身が自分の割当に経費申請（領収書ファイル任意）。
 *   multipart/form-data: delivery_assignment_id, kind(交通/宿泊/その他), amount, file?(領収書)
 *   service_role で実行。対象 assignment が本人の delivery に属することを必ず検証してから保存。
 *   領収書は private bucket expense-evidence にサーバ保存、expense_claims に status='submitted'・submitted_by=vendor で挿入。
 *   vendor の DB/Storage 直書込はしない。承認は既存（A-2b・コンソール=MB）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { resolveVendor, assertOwnAssignment } from '@/lib/vendor-auth'

const KINDS = ['交通', '宿泊', 'その他']

export async function POST(req: NextRequest) {
  const vendor = await resolveVendor()
  if (!vendor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const form = await req.formData()
  const assignmentId = String(form.get('delivery_assignment_id') ?? '').trim()
  const kindRaw = String(form.get('kind') ?? 'その他').trim()
  const kind = KINDS.includes(kindRaw) ? kindRaw : 'その他'
  const amount = Math.max(0, Math.round(Number(form.get('amount')) || 0))
  const file = form.get('file')
  if (!assignmentId) return NextResponse.json({ error: 'delivery_assignment_id required' }, { status: 400 })
  if (!amount) return NextResponse.json({ error: '金額を入力してください' }, { status: 400 })

  // 本人の割当か検証（他人の assignment への付与を拒否）
  if (!(await assertOwnAssignment(vendor.deliveryId, assignmentId))) {
    return NextResponse.json({ error: 'この割当に経費を申請する権限がありません' }, { status: 403 })
  }

  const admin = await createServiceRoleClient()

  // 領収書アップロード（任意・サーバ経由・private維持）
  let evidencePath: string | null = null
  if (file && typeof file !== 'string' && (file as File).size > 0) {
    const f = file as File
    const safeName = (f.name || 'receipt').replace(/[^\w.\-]+/g, '_').slice(-80)
    const path = `${vendor.deliveryId}/${assignmentId}/${crypto.randomUUID()}-${safeName}`
    const buf = new Uint8Array(await f.arrayBuffer())
    const { error: upErr } = await admin.storage.from('expense-evidence').upload(path, buf, {
      contentType: f.type || 'application/octet-stream', upsert: false,
    })
    if (upErr) return NextResponse.json({ error: `アップロード失敗: ${upErr.message}` }, { status: 500 })
    evidencePath = path
  }

  const { data, error } = await admin.from('expense_claims').insert({
    delivery_assignment_id: assignmentId, kind, amount, evidence_path: evidencePath,
    status: 'submitted', submitted_by: vendor.userId,
  }).select('id, kind, amount, status').single()
  if (error) {
    if (evidencePath) await admin.storage.from('expense-evidence').remove([evidencePath]).catch(() => {})
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 運営へ通知（best-effort・申請完了は阻害しない）
  try {
    const { sendSlack } = await import('@/lib/notify')
    await sendSlack(`🧾 委託先経費申請: ${vendor.deliveryName}（${kind} ¥${amount.toLocaleString()}）— コンソールで承認待ち`)
  } catch { /* best-effort */ }

  return NextResponse.json({ expense: data })
}
