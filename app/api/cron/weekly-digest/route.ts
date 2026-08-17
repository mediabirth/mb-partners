import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { logMail } from '@/lib/mail-send'
import { sendEmail } from '@/lib/notify'
import { loadDigestTipsForPreview, runWeeklyDigest, sampleDigestCopies } from '@/lib/weekly-digest-server'

export const runtime = 'nodejs'

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('authorization') === `Bearer ${secret}`
}

/** Vercel Cron: 毎週金曜11:00 JST。トグルOFFならmail_logにも触れず完全無音。 */
export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const admin = await createServiceRoleClient()
    return NextResponse.json({ ok: true, ...(await runWeeklyDigest(admin)) })
  } catch (error) {
    console.error('[cron/weekly-digest]', error)
    return NextResponse.json({ ok: false, error: 'weekly digest failed' }, { status: 500 })
  }
}

/**
 * バッチ検証専用の1通プレビュー。CRON_SECRET保護＋内部シンク限定で、全体配信トグルとは独立。
 * 実ユーザー宛、cc-monitor宛、任意ドメイン宛には構造的に送れない。
 */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({})) as { to?: unknown }
  const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : ''
  if (!to.endsWith('@mb-system.internal') || to.includes('cc-monitor')) {
    return NextResponse.json({ error: 'internal sink only' }, { status: 400 })
  }
  const admin = await createServiceRoleClient()
  const tips = await loadDigestTipsForPreview(admin)
  const copy = sampleDigestCopies(tips)[0]
  if (!copy) return NextResponse.json({ error: 'no digest sample' }, { status: 503 })
  const result = await sendEmail({ to, subject: copy.subject, text: copy.text, html: copy.html })
  await logMail({
    template_key: 'weekly-digest-preview', event: '週次ダイジェスト（構造確認）', to_email: to, to_role: 'partner',
    subject: copy.subject, status: result.sent ? 'sent' : result.error ? 'error' : 'skipped',
    detail: result.error ?? result.skipped ?? null, meta: { event_type: 'preview', segment: copy.segment },
  })
  return NextResponse.json({ ok: result.sent, sent: result.sent, skipped: result.skipped ?? null, error: result.error ?? null })
}
