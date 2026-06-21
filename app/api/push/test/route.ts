import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { notify } from '@/lib/notify/index'

// Wave1-④a：購読→配信の経路実証用テスト送信（CRON_SECRET 保護・お金/案件状態に一切触れない）。
// web-push は Node ランタイム必須。
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const admin = await createServiceRoleClient()
  const url = req.nextUrl
  const partnerId = url.searchParams.get('partnerId')

  // 対象 partner（指定が無ければ「有効購読を持つ全 partner」）。
  let targets: string[] = []
  if (partnerId) targets = [partnerId]
  else {
    const { data } = await admin.from('push_subscriptions').select('partner_id').eq('enabled', true)
    targets = [...new Set((data ?? []).map((r: { partner_id: string }) => r.partner_id))]
  }

  const payload = { title: 'MB Partners 通知テスト', body: 'Web Push の経路が正常に通りました。', url: '/app/inbox', tag: 'mbp-test' }
  const results: Array<{ partnerId: string; channels: unknown }> = []
  for (const pid of targets) {
    const r = await notify(admin, pid, payload, { event: 'test' })
    results.push({ partnerId: pid, channels: r })
  }

  return NextResponse.json({ ok: true, targetCount: targets.length, results })
}
