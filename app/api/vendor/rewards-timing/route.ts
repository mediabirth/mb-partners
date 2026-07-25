import { NextResponse } from 'next/server'
import { loadVendorBundle } from '@/lib/vendor-data'
import { serverTimingHeader, timingEntry, timingNow, type ServerTimingEntry } from '@/lib/server-timing'

export const runtime = 'edge'

/**
 * Next.js のServer Componentは動的なレスポンスヘッダを書き換えられないため、
 * /vendor/rewards と同じ認証・同じloadVendorBundleを通す恒久観測口を提供する。
 * 返す本文は件数だけで、他vendorや顧客金額を新たに公開しない。
 */
export async function GET() {
  const totalStarted = timingNow()
  const timings: ServerTimingEntry[] = []
  const bundle = await loadVendorBundle(timings)
  if (!bundle) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const renderStarted = timingNow()
  const response = NextResponse.json({
    assignments: bundle.assignments.length,
    expenses: bundle.expenses.length,
    payouts: bundle.payouts.length,
  })
  timings.push(timingEntry('render', renderStarted, 'json serialization'))
  timings.push(timingEntry('total', totalStarted))
  response.headers.set('Server-Timing', serverTimingHeader(timings))
  response.headers.set('X-Server-Timing-Target', '/vendor/rewards')
  return response
}
