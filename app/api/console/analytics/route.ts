/**
 * BR-C5：ダッシュボード分析用の読取データAPI（owner/manager のみ）。
 * 数値の出所は既存：getAllDeals（件数/成約率/ファネル）＋ loadProjectPnl（受注額/MB粗利・lib/pnl計算不変）。
 * ★お金の計算・保存には一切触れない（読み取り集計のための材料を返すだけ）。
 */
import { NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { getAllDeals } from '@/lib/supabase/queries'
import { loadProjectPnl } from '@/lib/pnl-aggregate'
import { customerHonorific } from '@/lib/customer'

export const runtime = 'edge'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!profile || profile.role === 'partner' || profile.role === 'vendor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const admin = await createServiceRoleClient()
  const [deals, pnl] = await Promise.all([getAllDeals(admin), loadProjectPnl(admin)])

  // 流入経路・MB担当（best-effort・列未追加でも安全）
  const dim: Record<string, { intake: string | null; director: string | null }> = {}
  try {
    const { data } = await admin.from('deals').select('id, intake_type, director_id')
    for (const d of (data ?? []) as Array<{ id: string; intake_type: string | null; director_id: string | null }>) dim[d.id] = { intake: d.intake_type, director: d.director_id }
  } catch { /* 既定で扱う */ }
  const pnlById = Object.fromEntries(pnl.rows.map(r => [r.id, r]))

  const records = deals.map(d => {
    const pr = pnlById[d.id]
    const dirId = dim[d.id]?.director ?? null
    return {
      id: d.id,
      name: customerHonorific(d as Record<string, unknown>),
      status: d.status,
      service_id: d.service_id,
      service_name: d.services?.name ?? '—',
      intake: dim[d.id]?.intake ?? 'referral_coop',
      director_id: dirId,
      director_name: dirId ? (pnl.directorName[dirId] ?? '不明') : null,
      partner_code: d.partners?.code ?? null,
      partner_name: d.partners?.profiles?.name ?? null,
      created_at: d.created_at,
      fixed_month: d.fixed_month ?? null,
      revenue: pr?.revenue ?? 0,
      mbMargin: pr?.mbMargin ?? 0,
    }
  })

  return NextResponse.json({ records })
}
