import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

// Vercel Cron calls this route at schedule defined in vercel.json.
// Auth: Bearer CRON_SECRET header (set as Vercel env var).
export async function GET(req: NextRequest) {
  // ── Auth check ────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const auth = req.headers.get('authorization') ?? ''
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Determine target month ────────────────────────────────────
  // Use ?month=YYYY-MM param, or default to previous month
  let targetMonth = req.nextUrl.searchParams.get('month')
  if (!targetMonth) {
    const now = new Date()
    // Run on last day of month → close CURRENT month
    // If called on e.g. June 30, close '2026-06'
    targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  // ── Execute batch ─────────────────────────────────────────────
  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase.rpc('close_month_batch', { target_month: targetMonth })

  if (error) {
    console.error('[cron/close-month] error:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  console.log('[cron/close-month] success:', JSON.stringify(data))
  return NextResponse.json({ ok: true, result: data })
}
