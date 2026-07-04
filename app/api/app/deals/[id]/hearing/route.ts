/**
 * v2 リファラル：パートナーのヒヤリング入力を保存し、該当案件の協力タスク「ヒヤリング」を自動で完了に。
 * POST /api/app/deals/[id]/hearing  body: { text }
 * ★money計算・reward・status・deal本体には触れない。deal_tasks の note/done（既存列）のみ更新。
 *   ヒヤリングタスクが無い/協力dealでない場合も 200（no-op）＝作成・報酬ゲートを壊さない fail-open。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient, getCachedUser } from '@/lib/supabase/server'
import { getPartnerByUserId } from '@/lib/supabase/queries'

export const runtime = 'edge'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCachedUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const supabase = await createClient()
  const partner = await getPartnerByUserId(supabase, user.id)
  if (!partner) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  // 所有確認：この案件が当該パートナーのものか（RLSでも守られるが明示チェック）。
  const { data: deal } = await supabase.from('deals').select('id, partner_id').eq('id', id).eq('partner_id', partner.id).single()
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const raw = (typeof body.text === 'string' ? body.text : '').trim()
  // ライフサイクル: 文字数上限はサーバで強制（silent slice廃止＝超過は保存せず拒否。クライアントmaxLength=4000と同値）。
  if (raw.length > 4000) {
    return NextResponse.json({ error: '文字数上限（4,000字）を超えています', maxLength: 4000 }, { status: 400 })
  }
  const text = raw

  const admin = await createServiceRoleClient()
  // ヒヤリングタスク（kind か label に「ヒヤリング」を含む）を特定。
  const { data: tasks } = await admin.from('deal_tasks').select('id, label, kind, done').eq('deal_id', id)
  const hearing = (tasks ?? []).find((t: { label: string; kind: string }) => t.kind?.includes('ヒヤリング') || t.label?.includes('ヒヤリング'))

  if (!hearing) {
    // タスクが無い（紹介deal 等）：note を保存できないので no-op で 200（UI側は保存済み表示）。
    return NextResponse.json({ ok: true, taskUpdated: false })
  }

  // note を保存し、入力があれば自動で完了チェック（勝彦採用アイデア）。空入力ではチェックしない。
  const patch: Record<string, unknown> = { note: text || null }
  if (text) { patch.done = true; patch.done_at = new Date().toISOString(); patch.done_by = user.id }
  const { error } = await admin.from('deal_tasks').update(patch).eq('id', hearing.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, taskUpdated: true, done: !!text })
}
