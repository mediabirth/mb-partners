/**
 * PATCH /api/console/deals/[id]/project-status — プロジェクト実行ステータスの更新（MBのみ）。
 * ★お金（reward/frozen/payout/close_month_batch/lib/pnl）には一切触れない＝完全独立な実行メタデータ。
 *   既存の成約(受注確定)PATCH（status/amount/reward_snapshot）とは別ルートで、報酬計算を一切起動しない。
 * project_status 列が未追加(DDL前)でも壊さない（needsMigration を返す）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { PROJECT_STATUSES } from '@/lib/phase'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json()
  const ps = b.project_status === null ? null : String(b.project_status ?? '')
  if (ps !== null && !PROJECT_STATUSES.includes(ps as typeof PROJECT_STATUSES[number])) {
    return NextResponse.json({ error: '不正な project_status' }, { status: 400 })
  }
  const admin = await createServiceRoleClient()
  // project_status のみ更新（status/amount/reward_snapshot 等のお金関連は触らない）
  const { error } = await admin.from('deals').update({ project_status: ps }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  return NextResponse.json({ ok: true, project_status: ps })
}
