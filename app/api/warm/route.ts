import { NextRequest, NextResponse } from 'next/server'

// console(サブドメイン)の edge/middleware を常時ウォーム化する内部 keep-warm。
// apex の cron は console 描画ホストに到達しないため、ここからサーバ側 fetch で console ホストの
// 認証不要パスを直接叩く（warming fetch のみ・データ/認証/お金には一切触れない）。
// 固定 allowlist のみ＝ユーザー入力なし(SSRFなし)。/_/console/login 等は 200 で関数を起こす。
export const runtime = 'edge'

const WARM_TARGETS = [
  'https://console.mb-partners.app/console/login', // console ホストの middleware＋login描画を warm
  'https://mb-partners.app/login',                 // apex partner login
  'https://mb-partners.app/vendor/login',          // apex vendor login
]

export async function GET(req: NextRequest) {
  // Vercel Cron の Authorization: Bearer <CRON_SECRET> を検証（既存 cron と同方式）。
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('unauthorized', { status: 401 })
  }
  const results = await Promise.allSettled(
    WARM_TARGETS.map((u) => fetch(u, { cache: 'no-store', redirect: 'manual' })),
  )
  return NextResponse.json({
    ok: true,
    warmed: results.map((r, i) => ({ url: WARM_TARGETS[i], ok: r.status === 'fulfilled' })),
  })
}
