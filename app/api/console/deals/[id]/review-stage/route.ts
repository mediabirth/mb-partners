/**
 * PATCH /api/console/deals/[id]/review-stage — 稟議ステージ（表示専用メタ）の更新（MBのみ）。
 * ★お金（reward/frozen/payout/close_month_batch/lib/pnl）・status enum・status='confirmed'遷移・④b発火 に一切触れない。
 *   既存の成約(受注確定)PATCH（status/amount/reward_snapshot）とは別ルート＝report計算/confirmed経路を一切起動しない隔離更新。
 *   review_stage 列が未追加(DDL前)でも壊さない（needsMigration を返す）。
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'

const VALID = new Set(['negotiating', 'review'])

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || !['owner', 'manager', 'admin'].includes(profile.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const b = await req.json()
  const rs = b.review_stage === null || b.review_stage === '' ? null : String(b.review_stage)
  if (rs !== null && !VALID.has(rs)) return NextResponse.json({ error: '不正な review_stage' }, { status: 400 })

  const admin = await createServiceRoleClient()
  // review_stage のみ更新（status/amount/reward_snapshot 等のお金・confirmed関連は一切触らない）。
  const { error } = await admin.from('deals').update({ review_stage: rs }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message, needsMigration: true }, { status: 200 })
  return NextResponse.json({ ok: true, review_stage: rs })
}
