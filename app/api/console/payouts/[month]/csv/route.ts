import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    .select('id, status')
    .eq('month', monthDate)
    .single()

  if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 })
  if (batch.status === 'open') return NextResponse.json({ error: 'Batch is not yet closed' }, { status: 400 })

  const { data: items } = await supabase
    .from('payout_items')
    .select('gross, withholding, net, statement, partners(code, profiles(name))')
    .eq('batch_id', batch.id)
    .order('partner_id')

  if (!items) return NextResponse.json({ error: 'No items' }, { status: 404 })

  // ── 全銀フォーマット風 CSV ────────────────────────────────────
  const rows: string[] = [
    // Header
    ['パートナーコード', '氏名', '報酬総額', '源泉所得税', '振込金額(手取)'].join(','),
  ]

  for (const item of items) {
    const partner = item.partners as any
    const code = partner?.code ?? ''
    const name = (partner?.profiles as any)?.name ?? ''
    rows.push([code, name, item.gross, item.withholding, item.net].join(','))
  }

  // Totals row
  const totalGross = items.reduce((s, i) => s + i.gross, 0)
  const totalWh    = items.reduce((s, i) => s + i.withholding, 0)
  const totalNet   = items.reduce((s, i) => s + i.net, 0)
  rows.push(['', '合計', totalGross, totalWh, totalNet].join(','))

  const csv = rows.join('\r\n')
  const filename = `payout_${month}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
