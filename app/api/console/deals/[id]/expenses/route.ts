/**
 * 案件の経費申請（デリバリー割当単位）— コンソール owner/manager。
 * POST /api/console/deals/[id]/expenses  — 経費を1件作成（任意で領収書添付）。
 *   multipart/form-data: delivery_assignment_id, kind(交通/宿泊/その他), amount, file?(領収書)
 *   ファイルは service_role 経由で private バケット expense-evidence に保存し evidence_path を記録。
 *   経費は P&L 読取専用＝reward/payout/凍結 には一切触れない。承認(approved)時のみ粗利に反映。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

const KINDS = ['交通', '宿泊', 'その他']

async function requireWrite(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return null
  return user
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = await requireWrite(supabase)
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()

  const form = await req.formData()
  const assignmentId = String(form.get('delivery_assignment_id') ?? '').trim()
  const kindRaw = String(form.get('kind') ?? 'その他').trim()
  const kind = KINDS.includes(kindRaw) ? kindRaw : 'その他'
  const amount = Math.max(0, Math.round(Number(form.get('amount')) || 0))
  const note = String(form.get('note') ?? '').trim().slice(0, 500) || null
  const file = form.get('file')

  if (!assignmentId) return NextResponse.json({ error: 'delivery_assignment_id required' }, { status: 400 })

  // 割当が当該案件に属することを確認（経費は割当にぶら下がる）。
  const { data: assign, error: aErr } = await admin
    .from('delivery_assignments').select('id, deal_id').eq('id', assignmentId).single()
  if (aErr || !assign) return NextResponse.json({ error: '割当が見つかりません', needsMigration: true }, { status: 200 })
  if (assign.deal_id !== id) return NextResponse.json({ error: '割当が案件と一致しません' }, { status: 400 })

  // 領収書アップロード（任意・サーバ経由・private維持）。
  let evidencePath: string | null = null
  if (file && typeof file !== 'string' && (file as File).size > 0) {
    const f = file as File
    const safeName = (f.name || 'receipt').replace(/[^\w.\-]+/g, '_').slice(-80)
    const path = `${id}/${assignmentId}/${crypto.randomUUID()}-${safeName}`
    const buf = new Uint8Array(await f.arrayBuffer())
    const { error: upErr } = await admin.storage.from('expense-evidence').upload(path, buf, {
      contentType: f.type || 'application/octet-stream', upsert: false,
    })
    if (upErr) return NextResponse.json({ error: `アップロード失敗: ${upErr.message}` }, { status: 500 })
    evidencePath = path
  }

  const { data, error } = await admin.from('expense_claims').insert({
    delivery_assignment_id: assignmentId, kind, amount, evidence_path: evidencePath,
    status: 'submitted', submitted_by: user.id, note,
  }).select('*').single()
  if (error) {
    // テーブル未作成（DDL前）。アップロード済ファイルは掃除。
    if (evidencePath) await admin.storage.from('expense-evidence').remove([evidencePath]).catch(() => {})
    return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  }
  return NextResponse.json({ expense: data })
}
