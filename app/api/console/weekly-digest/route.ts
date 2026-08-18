import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { DIGEST_SEGMENT_LABEL, digestWeekKey } from '@/lib/weekly-digest'
import { loadDigestTipsForPreview, resolveWeeklyDigestAudience, sampleDigestCopies } from '@/lib/weekly-digest-server'
import { getSocialProof } from '@/lib/social-proof'

export const runtime = 'nodejs'

async function requireOwner() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  return profile?.role === 'owner'
}

export async function GET() {
  if (!(await requireOwner())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const admin = await createServiceRoleClient()
  const [{ data: settings, error: settingsError }, audience, tips, { data: logs }, socialProof] = await Promise.all([
    admin.from('notification_settings').select('weekly_digest_enabled').eq('id', 1).maybeSingle(),
    resolveWeeklyDigestAudience(admin),
    loadDigestTipsForPreview(admin),
    admin.from('mail_log').select('template_key, status, meta, created_at').in('template_key', ['weekly-digest', 'weekly-digest-unsubscribe']).order('created_at', { ascending: false }).limit(300),
    getSocialProof(7).catch(() => ({ referrals: 0, wins: 0, newPartners: 0 })),
  ])
  if (settingsError) return NextResponse.json({ error: '週次ダイジェスト設定のmigrationが必要です' }, { status: 503 })
  const segments = { new: 0, active: 0, quiet: 0 }
  for (const row of audience) segments[row.segment]++
  const history = new Map<string, { week: string; sent: number; stopped: number }>()
  for (const row of logs ?? []) {
    const meta = row.meta as { week_key?: string } | null
    const week = meta?.week_key ?? digestWeekKey(new Date(row.created_at))
    const entry = history.get(week) ?? { week, sent: 0, stopped: 0 }
    if (row.template_key === 'weekly-digest' && row.status === 'sent') entry.sent++
    if (row.template_key === 'weekly-digest-unsubscribe') entry.stopped++
    history.set(week, entry)
  }
  const samples = sampleDigestCopies(tips, new Date(), socialProof).map(copy => ({
    segment: copy.segment,
    label: DIGEST_SEGMENT_LABEL[copy.segment],
    subject: copy.subject,
    text: copy.text,
  }))
  return NextResponse.json({
    enabled: settings?.weekly_digest_enabled === true,
    preview: { total: audience.length, segments },
    samples,
    history: [...history.values()].sort((a, b) => b.week.localeCompare(a.week)).slice(0, 8),
  })
}

export async function PUT(req: NextRequest) {
  if (!(await requireOwner())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => ({})) as { enabled?: unknown }
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const admin = await createServiceRoleClient()
  const { error } = await admin.from('notification_settings').update({ weekly_digest_enabled: body.enabled, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) return NextResponse.json({ error: '保存できませんでした' }, { status: 500 })
  return NextResponse.json({ ok: true, enabled: body.enabled })
}
