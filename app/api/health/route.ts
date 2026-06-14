import { NextResponse } from 'next/server'

// Ultra-lightweight keep-warm endpoint.
// Hit this every 5 minutes with an external uptime pinger (UptimeRobot etc.)
// to prevent Vercel Node function cold starts on write-path routes.
// Edge runtime: always warm by definition, responds in <10ms.
export const runtime = 'edge'

export async function GET() {
  return NextResponse.json({ ok: true, ts: Date.now() })
}
