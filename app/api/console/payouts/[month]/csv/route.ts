import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'edge'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ month: string }> }
) {
  const { month } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role === 'partner' || !profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const monthDate = `${month}-01`

  const { data: batch } = await supabase
    .from('payout_batches')
    .select('id, month, status, payout_items(id, partner_id, gross, withholding, net, statement, partners(code, profiles(name)))')
    .eq('month', monthDate)
    .single()

  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (batch.status === 'open') return NextResponse.json({ error: 'Batch is not yet closed' }, { status: 400 })

  // R2-E: override を合算（フロンティアの配下分を含む）
  const { createServiceRoleClient } = await import('@/lib/supabase/server')
  const { augmentBatches } = await import('@/lib/frontier-payout')
  const admin = await createServiceRoleClient()
  const [aug] = await augmentBatches(admin, [batch])
  const items: any[] = (aug?.payout_items ?? []).slice().sort((a: any, b: any) => String(a.partner_id).localeCompare(String(b.partner_id)))

  // ── 全銀フォーマット風 CSV ────────────────────────────────────
  const esc = (v: string | number) => {
    const s = String(v ?? '')
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const line = (cells: (string | number)[]) => cells.map(esc).join(',')

  const rows: string[] = [
    line(['パートナーコード', '氏名', '報酬(自己)', 'オーバーライド', '報酬総額', '源泉所得税', '振込金額(手取)']),
  ]

  for (const item of items) {
    const partner = item.partners as any
    const code = partner?.code ?? ''
    const name = (partner?.profiles as any)?.name ?? ''
    rows.push(line([code, name, item.gross, item.override_gross ?? 0, item.combined_gross ?? item.gross, item.combined_withholding ?? item.withholding, item.combined_net ?? item.net]))
  }

  // Totals row
  const totalOwn = items.reduce((s, i) => s + (i.gross || 0), 0)
  const totalOv  = items.reduce((s, i) => s + (i.override_gross || 0), 0)
  const totalGross = items.reduce((s, i) => s + (i.combined_gross ?? i.gross), 0)
  const totalWh    = items.reduce((s, i) => s + (i.combined_withholding ?? i.withholding), 0)
  const totalNet   = items.reduce((s, i) => s + (i.combined_net ?? i.net), 0)
  rows.push(line(['', '合計', totalOwn, totalOv, totalGross, totalWh, totalNet]))

  // Excel(Windows) で日本語が文字化けしないよう UTF-8 BOM を付与
  const csv = '﻿' + rows.join('\r\n')
  const filename = `payout_${month}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
